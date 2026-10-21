import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { angebotLaden } from "@/lib/angebot-daten";
import { heuteIso } from "@/lib/datum";
import { bausteineAusAngebot } from "@/lib/rechnung";
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
export async function rechnungEntwurfAusAngebot(db: SupabaseClient<Database>, angebotId: string): Promise<RechnungEntwurfErgebnis> {
  const detail = await angebotLaden(angebotId, db);
  if (!detail) return { fehler: "Angebot nicht gefunden." };
  const { angebot: a, bausteine, projekt } = detail;
  if (a.archiviert) return { fehler: "Aus einem archivierten Angebot kann keine Rechnung entstehen." };
  if (a.status === "entwurf") return { fehler: "Das Angebot ist noch ein Entwurf. Markiere es zuerst als „Versendet“ oder „Angenommen“." };
  if (a.status === "abgelehnt") return { fehler: "Das Angebot wurde abgelehnt." };

  const positionen = bausteineAusAngebot(bausteine);
  if (!positionen.some((p) => p.typ === "position")) return { fehler: "Das Angebot hat keine Position." };

  const { data: vorhanden } = await db.from("invoices").select("id").eq("quote_id", angebotId).is("archiviert_am", null).limit(1);
  if (vorhanden?.length) return { id: vorhanden[0].id, projektId: projekt.id, hinweis: "Zu diesem Angebot gibt es schon eine Rechnung. Sie wird geöffnet." };

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
      rabatt_prozent: a.rabattProzent,
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
