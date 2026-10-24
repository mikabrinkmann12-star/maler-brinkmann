import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { angebotBerechnen } from "@/lib/angebot";
import { angebotLaden } from "@/lib/angebot-daten";
import { heuteIso } from "@/lib/datum";
import { bausteineAusAngebot, type RechnungsArt } from "@/lib/rechnung";
import { abschlagBausteine, abschlagNetto, gutschriftBetreff, type AbschlagWahl } from "@/lib/rechnung-eigen";
import { rechnungsEinstellungenLaden } from "@/lib/rechnung-einstellungen-daten";
import type { Database } from "@/lib/supabase/database.types";

// Rechnungsentwurf aus einem Angebot (Büro-Aktion und API). Der Aufrufer hat die Berechtigung vorher geprüft.
// HARTE REGEL: Hier entsteht nur ein ENTWURF in der App. Rechnungsnummer und Rechnungsdatei kommen ausschließlich vom Buchhaltungsprogramm.

export type RechnungEntwurfErgebnis = { fehler?: string; id?: string; hinweis?: string; projektId?: string };

function dbMeldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "P0001") return fehler.message;
  if (fehler.code === "23514") return "Ein Wert ist ungültig (zu lang oder außerhalb des erlaubten Bereichs).";
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

/**
 * Rechnungsentwurf aus einem versendeten oder angenommenen Angebot: Kunde, Positionen, Steuer und Rabatt werden übernommen,
 * Zahlungsziel und Skonto vom Angebot, sonst vom Kunden, sonst von der Firma; der Leistungszeitraum vom Projekt (sonst heute).
 * Gibt es für das Angebot schon eine Rechnung, wird deren ID zurückgegeben.
 */
export async function rechnungEntwurfAusAngebot(
  db: SupabaseClient<Database>,
  angebotId: string,
  optionen: { art?: "rechnung" | "abschlag" | "schluss"; abschlag?: AbschlagWahl } = {},
): Promise<RechnungEntwurfErgebnis> {
  const art = optionen.art ?? "rechnung";
  const detail = await angebotLaden(angebotId, db);
  if (!detail) return { fehler: "Angebot nicht gefunden." };
  const { angebot: a, bausteine, projekt } = detail;
  if (a.archiviert) return { fehler: "Aus einem archivierten Angebot kann keine Rechnung entstehen." };
  if (a.status === "entwurf") return { fehler: "Das Angebot ist noch ein Entwurf. Markiere es zuerst als „Versendet“ oder „Angenommen“." };
  if (a.status === "abgelehnt") return { fehler: "Das Angebot wurde abgelehnt." };

  let positionen = bausteineAusAngebot(bausteine);
  if (!positionen.some((p) => p.typ === "position")) return { fehler: "Das Angebot hat keine Position." };

  if (art === "abschlag") {
    // Mehrere Abschläge sind erlaubt; sie dürfen zusammen die Auftragssumme nicht übersteigen
    if (!optionen.abschlag) return { fehler: "Bitte Prozentsatz oder Betrag des Abschlags angeben." };
    const summe = angebotBerechnen(bausteine, { rabattProzent: a.rabattProzent, steuersatz: a.steuersatz, reverseCharge: a.reverseCharge }).nettoNachRabatt;
    const { data: bisher } = await db.from("invoices").select("netto, lexware_status, status").eq("quote_id", angebotId).eq("art", "abschlag").is("archiviert_am", null);
    const bereits = (bisher ?? []).filter((x) => x.lexware_status !== "voided").reduce((s, x) => s + Number(x.netto ?? 0), 0);
    const nr = (bisher ?? []).length + 1;
    const ergebnis = abschlagNetto(summe, optionen.abschlag, bereits);
    if ("fehler" in ergebnis) return { fehler: ergebnis.fehler };
    positionen = abschlagBausteine(a.betreff, optionen.abschlag, ergebnis.netto, nr);
  } else {
    // Normale Rechnung bzw. Schlussrechnung: gibt es zur Art schon eine offene Rechnung zum Angebot, wird sie geöffnet
    const { data: vorhanden } = await db.from("invoices").select("id").eq("quote_id", angebotId).eq("art", art).is("archiviert_am", null).limit(1);
    if (vorhanden?.length) return { id: vorhanden[0].id, projektId: projekt.id, hinweis: `Zu diesem Angebot gibt es schon ${art === "schluss" ? "eine Schlussrechnung" : "eine Rechnung"}. Sie wird geöffnet.` };
  }

  const { data: p } = await db
    .from("projects")
    .select("id, contact_id, start_datum, end_datum, contacts(zahlungsziel_tage, skonto_prozent, skonto_tage)")
    .eq("id", projekt.id)
    .maybeSingle();
  if (!p) return { fehler: "Projekt nicht gefunden." };
  if (!p.contact_id) return { fehler: "Das Projekt hat keinen Kunden. Trage den Kunden im Projekt ein." };

  const heute = heuteIso();
  const von = p.start_datum ?? heute;
  const bis = p.end_datum && p.end_datum >= von ? p.end_datum : heute > von ? heute : von;
  const kunde = p.contacts;

  const firmenZiel = await rechnungsEinstellungenLaden(db);
  const { data: neu, error } = await db
    .from("invoices")
    .insert({
      project_id: p.id,
      quote_id: angebotId,
      contact_id: p.contact_id,
      betreff: a.betreff,
      // Anfangs- und Schlusstext der Rechnung (Einstellungen → Rechnungen – Vorgaben); leer = die Buchhaltung nimmt ihren eigenen
      einleitung: firmenZiel.einleitung || null,
      schlusstext: firmenZiel.schlusstext || null,
      rechnungsdatum: heute,
      leistung_von: von,
      leistung_bis: bis,
      // Zahlungsbedingungen des Angebots gelten weiter; hat es keine, nimmt die Rechnung die des Kunden (sonst 14 Tage)
      zahlungsziel_tage: a.zahlungszielTage ?? kunde?.zahlungsziel_tage ?? firmenZiel.zahlungszielTage ?? 14,
      skonto_prozent:
        a.zahlungszielTage != null ? a.skontoProzent : kunde?.zahlungsziel_tage != null ? kunde.skonto_prozent ?? null : firmenZiel.skontoProzent,
      skonto_tage:
        a.zahlungszielTage != null ? a.skontoTage : kunde?.zahlungsziel_tage != null ? (kunde.skonto_prozent ? kunde.skonto_tage : null) : firmenZiel.skontoTage,
      steuersatz: a.steuersatz,
      reverse_charge: a.reverseCharge,
      // Beim Abschlag steckt der Rabatt schon in der Auftragssumme, auf die der Abschlag berechnet wurde
      rabatt_prozent: art === "abschlag" ? 0 : a.rabattProzent,
      art,
    })
    .select("id")
    .single();
  if (error) return { fehler: dbMeldung(error) };

  const { error: itemsFehler } = await db.from("invoice_items").insert(
    positionen.map((b, i) => ({
      invoice_id: neu.id,
      sortierung: i,
      typ: b.typ,
      kurztext: b.kurztext || null,
      langtext: b.langtext || null,
      menge: b.menge,
      einheit: b.typ === "position" ? b.einheit : null,
      einzelpreis: b.einzelpreis,
    })),
  );
  if (itemsFehler) {
    await db.from("invoices").update({ archiviert_am: new Date().toISOString() }).eq("id", neu.id);
    return { fehler: "Die Positionen konnten nicht übernommen werden. Bitte nochmal versuchen." };
  }
  return { id: neu.id, projektId: p.id };
}

/**
 * Entwurf einer Gutschrift oder Stornorechnung zu einer fertigen eigenen Rechnung: Kunde, Texte, Steuer, Rabatt und alle Positionen werden
 * übernommen (Mengen und Preise bleiben positiv, die Summen werden beim Fertigstellen negativ). Bei einer Gutschrift darf das Büro die Positionen
 * danach noch kürzen oder ändern, ein Storno wird sofort fertiggestellt.
 */
export async function folgedokumentEntwurf(db: SupabaseClient<Database>, originalId: string, art: Extract<RechnungsArt, "gutschrift" | "storno">): Promise<RechnungEntwurfErgebnis> {
  const { data: o } = await db
    .from("invoices")
    .select("id, project_id, contact_id, quote_id, betreff, rechnungsnummer, status, anbieter, art, lexware_status, zahlungsziel_tage, steuersatz, reverse_charge, rabatt_prozent, leistung_von, leistung_bis, archiviert_am")
    .eq("id", originalId)
    .maybeSingle();
  if (!o) return { fehler: "Rechnung nicht gefunden." };
  if (o.anbieter !== "eigen" || o.status !== "uebertragen" || !o.rechnungsnummer || o.archiviert_am) return { fehler: "Das geht nur bei einer fertigen Rechnung der App." };
  if (o.art === "gutschrift" || o.art === "storno") return { fehler: "Zu einer Gutschrift gibt es keine weitere Gutschrift." };
  if (o.lexware_status === "voided") return { fehler: `Die Rechnung ${o.rechnungsnummer} ist schon storniert.` };

  const { data: items } = await db.from("invoice_items").select("typ, kurztext, langtext, menge, einheit, einzelpreis, sortierung").eq("invoice_id", originalId).order("sortierung");
  const heute = heuteIso();
  const { data: neu, error } = await db
    .from("invoices")
    .insert({
      project_id: o.project_id,
      contact_id: o.contact_id,
      quote_id: null,
      betreff: gutschriftBetreff(art, o.rechnungsnummer, o.betreff),
      einleitung: art === "storno" ? `Wir stornieren hiermit unsere Rechnung ${o.rechnungsnummer}.` : `Wir erstatten Ihnen folgende Leistungen zu unserer Rechnung ${o.rechnungsnummer}:`,
      rechnungsdatum: heute,
      leistung_von: o.leistung_von,
      leistung_bis: o.leistung_bis,
      zahlungsziel_tage: 0,
      steuersatz: o.steuersatz,
      reverse_charge: o.reverse_charge,
      rabatt_prozent: o.rabatt_prozent,
      art,
      bezug_id: originalId,
    })
    .select("id")
    .single();
  if (error) return { fehler: dbMeldung(error) };
  const { error: itemsFehler } = await db.from("invoice_items").insert(
    (items ?? []).map((b, i) => ({ invoice_id: neu.id, sortierung: i, typ: b.typ, kurztext: b.kurztext, langtext: b.langtext, menge: b.menge, einheit: b.einheit, einzelpreis: b.einzelpreis })),
  );
  if (itemsFehler) {
    await db.from("invoices").update({ archiviert_am: new Date().toISOString() }).eq("id", neu.id);
    return { fehler: "Die Positionen konnten nicht übernommen werden. Bitte nochmal versuchen." };
  }
  return { id: neu.id, projektId: o.project_id };
}
