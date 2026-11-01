"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBueroRecht } from "@/lib/auth";
import { steuerAusAuswahl } from "@/lib/angebot-schema";
import { heuteIso, istIsoDatum } from "@/lib/datum";
import { firmaLaden } from "@/lib/firma-daten";
import { eRechnungFuer, gespeichertesPdf, pdfMitXml } from "@/lib/e-rechnung-daten";
import { mahnungPdf } from "@/lib/mahnung-pdf";
import { mailSenden, firmaMitLogo } from "@/lib/rechnung-versand";
import { rechnungsEinstellungenLaden } from "@/lib/rechnung-einstellungen-daten";
import { MAHN_STUFEN_NAMEN, stufeSchluessel } from "@/lib/rechnung-einstellungen";
import { faelligAm } from "@/lib/dashboard";
import { rechnungMailSchema } from "@/lib/rechnung-mail";
import { istMahnstufe } from "@/lib/mahnung";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { RECHNUNGS_ART_NAMEN, istGutschriftArt, rechnungBerechnen } from "@/lib/rechnung";
import { rechnungLaden } from "@/lib/rechnung-daten";
import { faelligkeitsDatum, mahnBetraege, pflichtangabenFehlen, reverseChargeHinweis, tageUeberfaellig } from "@/lib/rechnung-eigen";
import { rechnungPdfErzeugen } from "@/lib/rechnung-pdf-daten";
import { folgedokumentEntwurf, rechnungEntwurfAusAngebot } from "@/lib/rechnung-erstellen";
import { rechnungBausteinPruefen, rechnungKopfSchema, type RechnungBausteinEingabe } from "@/lib/rechnung-schema";
import { createClient } from "@/lib/supabase/server";

// Rechnungen (Büro und Admin). Verbindlich regeln RLS und Trigger der Datenbank die Rechte und die Sperre nach dem Fertigstellen.
// Die App vergibt Nummer und PDF selbst (invoices.anbieter = „eigen“). Rechnungen mit einem anderen Anbieter sind ältere Rechnungen aus früheren Systemen:
// sie bleiben les- und mahnbar, werden aber nicht mehr verändert oder storniert.

export type RechnungErgebnis = { fehler?: string; id?: string; hinweis?: string };

const uuid = z.uuid();

function dbMeldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "P0001") return fehler.message; // Meldungen der Trigger sind schon deutsch
  if (fehler.code === "23514") return "Ein Wert ist ungültig (zu lang oder außerhalb des erlaubten Bereichs).";
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

function aktualisieren(id?: string, projektId?: string) {
  revalidatePath("/buero/rechnungen", "layout");
  if (id) revalidatePath(`/buero/rechnungen/${id}`);
  if (projektId) {
    revalidatePath(`/baustellen/${projektId}`);
    revalidatePath(`/buero/projekte/${projektId}`);
  }
}

// ---------------------------------------------------------------------------
// Rechnung aus dem Angebot erstellen
// ---------------------------------------------------------------------------

/**
 * Rechnungsentwurf aus einem versendeten oder angenommenen Angebot: Kunde, Positionen, Steuer und Rabatt werden übernommen,
 * Zahlungsziel und Skonto vom Kunden, der Leistungszeitraum vom Projekt (sonst heute). Gibt es für das Angebot schon eine
 * Rechnung, wird diese geöffnet.
 */
export async function rechnungAusAngebotErstellen(
  angebotId: string,
  optionen?: { art?: "rechnung" | "abschlag" | "schluss"; abschlag?: { modus: "prozent"; prozent: number } | { modus: "betrag"; netto: number } },
): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  const o = z
    .object({
      art: z.enum(["rechnung", "abschlag", "schluss"]).optional(),
      abschlag: z.union([z.object({ modus: z.literal("prozent"), prozent: z.number().gt(0).max(100) }), z.object({ modus: z.literal("betrag"), netto: z.number().gt(0).max(10_000_000) })]).optional(),
    })
    .safeParse(optionen ?? {});
  if (!o.success) return { fehler: "Bitte einen Prozentsatz (1 bis 100) oder einen Betrag angeben." };
  const supabase = await createClient();
  const r = await rechnungEntwurfAusAngebot(supabase, angebotId, o.data);
  if (r.id && !r.hinweis) aktualisieren(r.id, r.projektId);
  return { fehler: r.fehler, id: r.id, hinweis: r.hinweis };
}

// ---------------------------------------------------------------------------
// Kopf und Bausteine bearbeiten (nur im Entwurf; die Datenbank sperrt sonst)
// ---------------------------------------------------------------------------

export async function rechnungKopfSpeichern(id: string, eingabe: unknown): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const pruefung = rechnungKopfSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const k = pruefung.data;
  const steuer = steuerAusAuswahl(k.steuer);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({
      betreff: k.betreff,
      rechnungsdatum: k.rechnungsdatum,
      leistung_von: k.leistungVon,
      leistung_bis: k.leistungBis,
      zahlungsziel_tage: k.zahlungsziel,
      skonto_prozent: k.skontoProzent,
      skonto_tage: k.skontoTage,
      steuersatz: steuer.steuersatz,
      reverse_charge: steuer.reverseCharge,
      rabatt_prozent: k.rabatt,
      einleitung: k.einleitung || null,
      schlusstext: k.schlusstext || null,
    })
    .eq("id", id)
    .select("id, project_id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Rechnung nicht gefunden." };
  aktualisieren(id, data[0].project_id);
  return { id };
}

export async function rechnungBausteinSpeichern(rechnungId: string, id: string | null, eingabe: RechnungBausteinEingabe): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(rechnungId).success || (id !== null && !uuid.safeParse(id).success)) return { fehler: "Ungültige Eingabe." };
  const pruefung = rechnungBausteinPruefen(eingabe);
  if ("fehler" in pruefung) return { fehler: pruefung.fehler };
  const d = pruefung.daten;
  const felder = {
    kurztext: d.kurztext || null,
    langtext: d.langtext || null,
    menge: d.menge,
    einheit: d.typ === "position" ? d.einheit : null,
    einzelpreis: d.einzelpreis,
  };

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("invoice_items").update(felder).eq("id", id).eq("invoice_id", rechnungId).select("id");
    if (error) return { fehler: dbMeldung(error) };
    if (!data?.length) return { fehler: "Baustein nicht gefunden." };
    aktualisieren(rechnungId);
    return { id };
  }
  const { data: letzte } = await supabase.from("invoice_items").select("sortierung").eq("invoice_id", rechnungId).order("sortierung", { ascending: false }).limit(1);
  const { data, error } = await supabase
    .from("invoice_items")
    .insert({ ...felder, typ: d.typ, invoice_id: rechnungId, sortierung: (letzte?.[0]?.sortierung ?? -1) + 1 })
    .select("id")
    .single();
  if (error) return { fehler: dbMeldung(error) };
  aktualisieren(rechnungId);
  return { id: data.id };
}

export async function rechnungBausteinLoeschen(rechnungId: string, id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(rechnungId).success || !uuid.safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoice_items").delete().eq("id", id).eq("invoice_id", rechnungId).select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Baustein nicht gefunden." };
  aktualisieren(rechnungId);
  return { id };
}

export async function rechnungBausteinVerschieben(rechnungId: string, id: string, richtung: "hoch" | "runter"): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(rechnungId).success || !uuid.safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data: r } = await supabase.from("invoices").select("status").eq("id", rechnungId).maybeSingle();
  if (!r) return { fehler: "Rechnung nicht gefunden." };
  if (r.status !== "entwurf") return { fehler: "Diese Rechnung ist fertiggestellt und gesperrt." };

  const { data } = await supabase.from("invoice_items").select("id, sortierung").eq("invoice_id", rechnungId).order("sortierung").order("created_at");
  const ids = (data ?? []).map((z) => z.id);
  const stelle = ids.indexOf(id);
  const ziel = richtung === "hoch" ? stelle - 1 : stelle + 1;
  if (stelle < 0) return { fehler: "Baustein nicht gefunden." };
  if (ziel < 0 || ziel >= ids.length) return { id };
  [ids[stelle], ids[ziel]] = [ids[ziel], ids[stelle]];
  const alt = new Map((data ?? []).map((z) => [z.id, z.sortierung]));
  for (const [i, bausteinId] of ids.entries()) {
    if (alt.get(bausteinId) !== i) await supabase.from("invoice_items").update({ sortierung: i }).eq("id", bausteinId);
  }
  aktualisieren(rechnungId);
  return { id };
}

/** Einen Rechnungsentwurf ausblenden (archivieren). Fertige Rechnungen bleiben sichtbar. */
export async function rechnungArchivieren(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ archiviert_am: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "entwurf")
    .select("id, project_id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Nur Entwürfe lassen sich archivieren. Fertige Rechnungen bleiben sichtbar." };
  aktualisieren(id, data[0].project_id);
  return { id };
}

/** Einen archivierten Rechnungsentwurf wieder einblenden. */
export async function rechnungWiederherstellen(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ archiviert_am: null })
    .eq("id", id)
    .eq("status", "entwurf")
    .not("archiviert_am", "is", null)
    .select("id, project_id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Diese Rechnung lässt sich nicht wiederherstellen." };
  aktualisieren(id, data[0].project_id);
  return { id };
}

// ---------------------------------------------------------------------------
// Versand, Zahlung, Mahnung und Storno
// ---------------------------------------------------------------------------

/** Rechnung per E-Mail an den Kunden schicken: das gespeicherte PDF wird angehängt, bei Rechnungen der App mit eingebetteter E-Rechnung. */
export async function rechnungPerMailSenden(id: string, eingabe: unknown): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const pruefung = rechnungMailSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const mail = pruefung.data;
  const detail = await rechnungLaden(id);
  if (!detail) return { fehler: "Rechnung nicht gefunden." };
  const { rechnung: r } = detail;
  if (r.status !== "uebertragen" || !r.rechnungsnummer) return { fehler: "Nur eine fertige Rechnung lässt sich versenden." };
  if (!r.pdfPfad) return { fehler: "Die Rechnung hat noch kein PDF. Tippe zuerst auf „PDF neu erzeugen“." };
  const supabase = await createClient();
  const pdf = await gespeichertesPdf(r.pdfPfad);
  if (!pdf) return { fehler: "Das PDF konnte nicht geladen werden." };
  // Das PDF geht mit eingebettetem XML (E-Rechnung) raus; für Behörden (Leitweg-ID) zusätzlich die XRechnung als eigene XML-Datei
  const e = await eRechnungFuer(id);
  const dateiname = `${RECHNUNGS_ART_NAMEN[r.art]}_${r.rechnungsnummer}`;
  const anhaenge = [{ filename: `${dateiname}.pdf`, content: e ? await pdfMitXml(pdf, e.xml) : pdf, contentType: "application/pdf" }];
  if (e?.profil === "xrechnung") anhaenge.push({ filename: `${dateiname}.xml`, content: new TextEncoder().encode(e.xml), contentType: "application/xml" });
  const gesendet = await mailSenden({ ...mail, anhaenge });
  if (gesendet.fehler) return { fehler: gesendet.fehler };
  const { error } = await supabase.from("invoices").update({ versendet_am: new Date().toISOString(), versendet_an: mail.an }).eq("id", id);
  if (error) return { fehler: `Die E-Mail ist an ${mail.an} gegangen, der Versand konnte aber nicht vermerkt werden.` };
  aktualisieren(id, r.projectId);
  return { id };
}

/** Zahlung buchen: die Rechnung gilt danach als bezahlt. */
export async function rechnungAlsBezahltBuchen(id: string, datum: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  if (!istIsoDatum(datum) || datum > heuteIso()) return { fehler: "Bitte ein Zahlungsdatum angeben, das nicht in der Zukunft liegt." };
  const detail = await rechnungLaden(id);
  if (!detail) return { fehler: "Rechnung nicht gefunden." };
  const { rechnung: r } = detail;
  if (r.status !== "uebertragen" || r.lexwareStatus !== "open") return { fehler: "Nur eine offene, fertige Rechnung lässt sich als bezahlt buchen." };
  if (datum < r.rechnungsdatum) return { fehler: "Das Zahlungsdatum liegt vor dem Rechnungsdatum." };
  const supabase = await createClient();
  // Die Spalte heißt noch lexware_status (aus einer früheren Anbindung), sie bedeutet: open = offen, paid = bezahlt, voided = storniert
  const { data, error } = await supabase.from("invoices").update({ lexware_status: "paid", bezahlt_am: datum, mahnstufe: 0, angemahnt_am: null }).eq("id", id).eq("lexware_status", "open").select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Das hat nicht geklappt (vielleicht ist die Rechnung schon bezahlt)." };
  aktualisieren(id, r.projectId);
  revalidatePath("/buero");
  return { id };
}

/** Zahlung zurücknehmen (z. B. falsch gebucht): die Rechnung ist wieder offen. */
export async function rechnungZahlungZuruecknehmen(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .update({ lexware_status: "open", bezahlt_am: null })
    .eq("id", id)
    .eq("lexware_status", "paid")
    .select("id, project_id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Das hat nicht geklappt." };
  aktualisieren(id, data[0].project_id);
  revalidatePath("/buero");
  return { id };
}

/**
 * Zahlungserinnerung bzw. Mahnung: erzeugt das Mahnschreiben als PDF (Gebühr und Zinsen aus Einstellungen → Rechnungen), schickt es mit der Rechnung per E-Mail,
 * vermerkt es im Verlauf und setzt die Mahnstufe.
 */
export async function rechnungMahnen(id: string, stufe: number, eingabe: unknown): Promise<RechnungErgebnis> {
  const nutzer = await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success || !istMahnstufe(stufe)) return { fehler: "Ungültige Eingabe." };
  const pruefung = rechnungMailSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const mail = pruefung.data;
  const detail = await rechnungLaden(id);
  if (!detail) return { fehler: "Rechnung nicht gefunden." };
  const { rechnung: r, kunde } = detail;
  if (r.status !== "uebertragen" || r.lexwareStatus !== "open" || !r.rechnungsnummer || r.art === "gutschrift" || r.art === "storno") {
    return { fehler: "Eine Mahnung gibt es nur zu einer offenen, fertigen Rechnung." };
  }
  if (stufe <= r.mahnstufe) return { fehler: "Diese Mahnstufe wurde schon gesendet." };
  const schluessel = stufeSchluessel(stufe);
  if (!schluessel) return { fehler: "Ungültige Mahnstufe." };
  const vorgaben = (await rechnungsEinstellungenLaden())[schluessel];

  const heute = heuteIso();
  const offen = r.brutto ?? 0;
  const tage = tageUeberfaellig(faelligAm(r.rechnungsdatum, r.zahlungszielTage) ?? faelligkeitsDatum(r.rechnungsdatum, r.zahlungszielTage), heute);
  const betraege = mahnBetraege(offen, tage, { zinsenProzent: vorgaben.zinsenProzent, gebuehr: stufe > 1 ? vorgaben.gebuehr : 0 });
  const frist = new Date(Date.parse(`${heute}T12:00:00Z`) + vorgaben.tage * 86_400_000).toISOString().slice(0, 10);

  const supabase = await createClient();
  const { firma, logo } = await firmaMitLogo();
  const pdf = await mahnungPdf({
    firma, logo, empfaenger: kunde.anschrift.length ? kunde.anschrift.join("\n") : kunde.name, kundennummer: kunde.kundennummer, stufeName: MAHN_STUFEN_NAMEN[schluessel], datum: heute,
    rechnungsnummer: r.rechnungsnummer, rechnungsdatum: r.rechnungsdatum, betreff: r.betreff, frist, text: mail.text, betraege, zinsenProzent: vorgaben.zinsenProzent, tageUeberfaellig: tage,
  });
  const anhaenge = [{ filename: `${MAHN_STUFEN_NAMEN[schluessel].replace(/[^A-Za-z0-9]+/g, "_")}_${r.rechnungsnummer}.pdf`, content: pdf, contentType: "application/pdf" }];
  if (r.pdfPfad) {
    const { data: rechnungsPdf } = await supabase.storage.from("rechnungen").download(r.pdfPfad);
    if (rechnungsPdf) anhaenge.push({ filename: `Rechnung_${r.rechnungsnummer}.pdf`, content: new Uint8Array(await rechnungsPdf.arrayBuffer()), contentType: "application/pdf" });
  }
  const gesendet = await mailSenden({ ...mail, anhaenge });
  if (gesendet.fehler) return { fehler: gesendet.fehler };

  const { error: verlaufFehler } = await supabase.from("invoice_reminders").insert({ invoice_id: id, stufe, versendet_an: mail.an, versendet_am: new Date().toISOString(), created_by: nutzer.id });
  const { error } = await supabase.from("invoices").update({ mahnstufe: stufe, angemahnt_am: heute }).eq("id", id);
  aktualisieren(id, r.projectId);
  revalidatePath("/buero");
  if (error || verlaufFehler) return { id, hinweis: `Die E-Mail ist an ${mail.an} gegangen, der Vermerk in der App konnte aber nicht gespeichert werden.` };
  return { id };
}

/**
 * Rechnung stornieren (nicht rücknehmbar): kopiert alle Positionen, stellt die Stornorechnung sofort fertig (eigene Nummer „G-…“) und markiert die Rechnung als storniert.
 * Nur bei Rechnungen der App.
 */
export async function rechnungStornieren(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const vorhanden = await rechnungLaden(id);
  if (!vorhanden) return { fehler: "Rechnung nicht gefunden." };
  if (vorhanden.rechnung.anbieter !== "eigen") return { fehler: "Ältere Rechnungen aus früheren Systemen lassen sich hier nicht stornieren." };
  const supabase = await createClient();
  const e = await folgedokumentEntwurf(supabase, id, "storno");
  if (e.fehler || !e.id) return { fehler: e.fehler ?? "Die Stornorechnung konnte nicht angelegt werden." };
  const fertig = await eigenFertigstellen(e.id);
  if (fertig.fehler) {
    // Ohne Nummer bleibt kein Entwurf liegen
    await supabase.from("invoices").update({ archiviert_am: new Date().toISOString() }).eq("id", e.id).eq("status", "entwurf");
    return { fehler: fertig.fehler };
  }
  aktualisieren(id, e.projektId);
  return { id: e.id, hinweis: fertig.hinweis };
}

/** Entwurf einer Gutschrift (Teilerstattung) zu einer fertigen eigenen Rechnung; die Positionen lassen sich danach kürzen, dann „Gutschrift fertigstellen“. */
export async function rechnungGutschriftErstellen(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const supabase = await createClient();
  const e = await folgedokumentEntwurf(supabase, id, "gutschrift");
  if (e.fehler || !e.id) return { fehler: e.fehler ?? "Die Gutschrift konnte nicht angelegt werden." };
  aktualisieren(e.id, e.projektId);
  return { id: e.id };
}

// ---------------------------------------------------------------------------
// Fertigstellen: Nummer und PDF kommen aus der App selbst
// ---------------------------------------------------------------------------

/** PDF der fertigen Rechnung erzeugen und als unveränderliche Kopie im Speicher ablegen (wird nie überschrieben). */
async function eigenesPdfSpeichern(id: string): Promise<boolean> {
  try {
    const pdf = await rechnungPdfErzeugen(id);
    if (!pdf) return false;
    const supabase = await createClient();
    const pfad = `${id}.pdf`;
    const { error } = await supabase.storage.from("rechnungen").upload(pfad, pdf.bytes, { contentType: "application/pdf", upsert: false });
    if (error && !/exists|duplicate/i.test(error.message)) return false;
    const { error: dbFehler } = await supabase.from("invoices").update({ pdf_pfad: pfad }).eq("id", id).is("pdf_pfad", null);
    return !dbFehler;
  } catch (e) {
    console.error("[rechnung] PDF konnte nicht erzeugt werden:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Rechnung fertigstellen: prüft die Pflichtangaben, vergibt in der Datenbank die nächste lückenlose Nummer (gleichzeitig mit dem Status „fertig“)
 * und erzeugt danach das PDF. Nicht rücknehmbar. Klappt das PDF nicht, bleibt die Rechnung gültig und „PDF neu erzeugen“ holt es nach.
 */
async function eigenFertigstellen(id: string): Promise<RechnungErgebnis> {
  const detail = await rechnungLaden(id);
  if (!detail) return { fehler: "Rechnung nicht gefunden." };
  const { rechnung: r, bausteine, kunde } = detail;
  if (r.archiviert) return { fehler: "Diese Rechnung ist archiviert." };
  if (r.status !== "entwurf") return { fehler: "Diese Rechnung ist schon fertiggestellt." };
  if (!bausteine.some((b) => b.typ === "position")) return { fehler: "Die Rechnung hat keine Position." };

  if (r.art === "rechnung" && r.quoteId) {
    const supabaseA = await createClient();
    const { count } = await supabaseA.from("invoices").select("id", { count: "exact", head: true }).eq("quote_id", r.quoteId).eq("art", "abschlag").eq("status", "uebertragen").neq("lexware_status", "voided");
    if (count) return { fehler: "Zu diesem Angebot gibt es fertige Abschlagsrechnungen. Bitte eine Schlussrechnung anlegen (im Angebot), damit sie angerechnet werden." };
  }
  const fehlt = pflichtangabenFehlen(await firmaLaden(), kunde.anschrift, r.reverseCharge);
  if (fehlt.length) return { fehler: `Für eine gültige Rechnung fehlt noch: ${fehlt.join(", ")}. Firmendaten stehen unter Einstellungen → Unternehmen, die Anschrift des Kunden im Kontakt.` };

  const summen = rechnungBerechnen(bausteine, { rabattProzent: r.rabattProzent, steuersatz: r.steuersatz, reverseCharge: r.reverseCharge });
  // Gutschrift und Storno: die Summen sind negativ (Mengen und Preise bleiben positiv). Bei der Schlussrechnung zieht die Datenbank die Abschläge ab.
  const vz = istGutschriftArt(r.art) ? -1 : 1;
  const supabase = await createClient();
  const { data: nummer, error } = await supabase.rpc("rechnung_finalisieren", { p_id: id, p_netto: vz * summen.nettoNachRabatt, p_brutto: vz * summen.brutto });
  if (error) return { fehler: dbMeldung(error) };

  let hinweis = reverseChargeHinweis(r.reverseCharge) ?? undefined;
  if (!(await eigenesPdfSpeichern(id))) {
    hinweis = `${hinweis ? `${hinweis} ` : ""}Die Rechnung hat die Nummer ${nummer}, das PDF konnte aber noch nicht erzeugt werden. Tippe auf „PDF neu erzeugen“.`;
  }
  aktualisieren(id, r.projectId);
  revalidatePath("/buero");
  return { id, hinweis };
}

/** PDF einer fertigen eigenen Rechnung nachholen (nur wenn noch keins gespeichert ist; ein vorhandenes PDF wird nie ersetzt). */
export async function rechnungPdfNeuErzeugen(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const detail = await rechnungLaden(id);
  if (!detail) return { fehler: "Rechnung nicht gefunden." };
  const { rechnung: r } = detail;
  if (r.anbieter !== "eigen" || r.status !== "uebertragen" || !r.rechnungsnummer) return { fehler: "Das geht nur bei einer fertigen Rechnung der App." };
  if (r.pdfPfad) return { fehler: "Diese Rechnung hat schon ein PDF. Es bleibt unverändert." };
  if (!(await eigenesPdfSpeichern(id))) return { fehler: "Das PDF konnte nicht erzeugt werden. Bitte nochmal versuchen." };
  aktualisieren(id, r.projectId);
  return { id };
}

/** Rechnung fertigstellen (Nummer und PDF aus der App, nicht rücknehmbar). */
export async function rechnungFertigstellen(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  return eigenFertigstellen(id);
}

/**
 * Vermerkt, wie weit eine offene Rechnung gemahnt wurde (0 = nicht gemahnt, 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung), ohne etwas zu versenden
 * (z. B. nach einem Anruf). Der Vermerk erscheint in den offenen Forderungen als „Angemahnt“.
 */
export async function rechnungMahnstufeSetzen(id: string, stufe: number): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success || !istMahnstufe(stufe)) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data: r } = await supabase.from("invoices").select("status, lexware_status, project_id").eq("id", id).maybeSingle();
  if (!r) return { fehler: "Rechnung nicht gefunden." };
  if (r.status !== "uebertragen" || r.lexware_status !== "open") return { fehler: "Eine Mahnung lässt sich nur bei einer offenen, fertigen Rechnung vermerken." };
  const { error } = await supabase.from("invoices").update({ mahnstufe: stufe, angemahnt_am: stufe > 0 ? heuteIso() : null }).eq("id", id);
  if (error) return { fehler: dbMeldung(error) };
  aktualisieren(id, r.project_id);
  revalidatePath("/buero");
  return { id };
}

/** Notiz zur Rechnung (intern, nicht auf dem PDF). Bleibt auch nach dem Fertigstellen änderbar. */
export async function rechnungNotizSpeichern(id: string, text: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const t = text.trim();
  if (t.length > 2000) return { fehler: "Die Notiz ist zu lang (höchstens 2.000 Zeichen)." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").update({ notiz: t || null }).eq("id", id).select("id, project_id");
  if (error || !data?.length) return { fehler: "Die Notiz konnte nicht gespeichert werden." };
  aktualisieren(id, data[0].project_id);
  return {};
}
