"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBueroRecht } from "@/lib/auth";
import { steuerAusAuswahl } from "@/lib/angebot-schema";
import { aktuellerAnbieter, sevdeskClient, sevdeskFinalisieren } from "@/lib/buchhaltung";
import { heuteIso, istIsoDatum } from "@/lib/datum";
import { lexwareClient, lexwareFinalisieren } from "@/lib/lexware";
import { rechnungMailSchema } from "@/lib/rechnung-mail";
import { sevdeskAbgleichen, sevdeskBezahltBuchen, sevdeskMahnen, sevdeskPerMail, sevdeskStornieren, sevdeskUebertragen, type Ergebnis } from "@/lib/sevdesk-uebertragung";
import { istMahnstufe } from "@/lib/mahnung";
import { LexwareFehler } from "@/lib/lexware-client";
import { ersteMeldung } from "@/lib/nutzer-schema";
import {
  lexwareKontaktPayload,
  lexwareRechnungPayload,
  rechnungBerechnen,
  type RechnungDaten,
} from "@/lib/rechnung";
import { rechnungLaden } from "@/lib/rechnung-daten";
import { rechnungEntwurfAusAngebot } from "@/lib/rechnung-erstellen";
import { rechnungBausteinPruefen, rechnungKopfSchema, type RechnungBausteinEingabe } from "@/lib/rechnung-schema";
import { createClient } from "@/lib/supabase/server";

// Rechnungen (Büro und Admin). Verbindlich regeln RLS und Trigger der Datenbank die Rechte und die Sperre nach der Übertragung.
// HARTE REGEL: Rechnungsnummer und Rechnungs-PDF kommen ausschließlich von Lexware.

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
export async function rechnungAusAngebotErstellen(angebotId: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  const supabase = await createClient();
  const r = await rechnungEntwurfAusAngebot(supabase, angebotId);
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
  if (r.status !== "entwurf") return { fehler: "Diese Rechnung wurde schon an Lexware übertragen und ist gesperrt." };

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

/** Einen Rechnungsentwurf ausblenden (archivieren). Übertragene Rechnungen bleiben sichtbar. */
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
  if (!data?.length) return { fehler: "Nur Entwürfe lassen sich archivieren. Übertragene Rechnungen bleiben sichtbar." };
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
// Übertragung an die Buchhaltung (sevdesk im Hintergrund, ältere Rechnungen bei Lexware) und Abgleich
// ---------------------------------------------------------------------------

/** Gemeinsamer Rahmen für alle Abläufe mit sevdesk: Rechte sind geprüft, Client und Rechnung werden geladen, danach werden Seiten neu geladen. */
async function mitSevdesk(
  id: string,
  ablauf: (db: Awaited<ReturnType<typeof createClient>>, client: NonNullable<ReturnType<typeof sevdeskClient>>, detail: NonNullable<Awaited<ReturnType<typeof rechnungLaden>>>) => Promise<Ergebnis>,
): Promise<RechnungErgebnis> {
  const client = sevdeskClient();
  if (!client) return { fehler: "Die Buchhaltung ist noch nicht eingerichtet (der sevdesk-Token fehlt)." };
  const detail = await rechnungLaden(id);
  if (!detail) return { fehler: "Rechnung nicht gefunden." };
  const r = await ablauf(await createClient(), client, detail);
  aktualisieren(id, detail.rechnung.projectId);
  revalidatePath("/buero");
  return r;
}

/** Rechnung per E-Mail an den Kunden schicken (über die Buchhaltung, die PDF bzw. XML anhängt). */
export async function rechnungPerMailSenden(id: string, eingabe: unknown): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const pruefung = rechnungMailSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  return mitSevdesk(id, (db, client, detail) => sevdeskPerMail(db, client, detail, pruefung.data));
}

/** Zahlung buchen: die Rechnung gilt danach als bezahlt. */
export async function rechnungAlsBezahltBuchen(id: string, datum: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  if (!istIsoDatum(datum) || datum > heuteIso()) return { fehler: "Bitte ein Zahlungsdatum angeben, das nicht in der Zukunft liegt." };
  return mitSevdesk(id, (db, client, detail) => sevdeskBezahltBuchen(db, client, detail, datum));
}

/** Zahlungserinnerung bzw. Mahnung anlegen und per E-Mail senden. */
export async function rechnungMahnen(id: string, stufe: number, eingabe: unknown): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success || !istMahnstufe(stufe)) return { fehler: "Ungültige Eingabe." };
  const pruefung = rechnungMailSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  return mitSevdesk(id, (db, client, detail) => sevdeskMahnen(db, client, detail, stufe, pruefung.data));
}

/** Rechnung stornieren (Stornorechnung in der Buchhaltung, nicht rücknehmbar). */
export async function rechnungStornieren(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  return mitSevdesk(id, (db, client, detail) => sevdeskStornieren(db, client, detail));
}

/**
 * Original-Datei der Rechnung aus Lexware holen und als Kopie in der App ablegen: bei einer normalen Rechnung und bei ZUGFeRD ein PDF
 * (ZUGFeRD trägt die Rechnungsdaten eingebettet), bei einer XRechnung (Behörden, mit Leitweg-ID) eine XML-Datei. Fehler sind hier nicht
 * schlimm, „Aus Lexware abgleichen“ holt es nach.
 */
async function dateiSichern(rechnungId: string, lexwareId: string): Promise<boolean> {
  const client = lexwareClient();
  if (!client) return false;
  try {
    const datei = await client.rechnungDatei(lexwareId);
    const endung = datei.contentType.includes("xml") ? "xml" : "pdf";
    const supabase = await createClient();
    const pfad = `${rechnungId}.${endung}`;
    const { error } = await supabase.storage.from("rechnungen").upload(pfad, datei.bytes, { contentType: endung === "xml" ? "application/xml" : "application/pdf", upsert: true });
    if (error) return false;
    const { error: dbFehler } = await supabase.from("invoices").update({ pdf_pfad: pfad }).eq("id", rechnungId);
    return !dbFehler;
  } catch {
    return false;
  }
}

/**
 * Rechnung an Lexware Office übertragen. Standard: Lexware FINALISIERT sofort (vergibt die Nummer und erzeugt das PDF, nicht rücknehmbar);
 * mit LEXWARE_MODUS=entwurf nur als Entwurf. Danach kommen Nummer, Status, Summen und PDF zurück in die App.
 * Zuerst wird die Rechnung hier „reserviert“ (Status wird_uebertragen), damit ein Doppelklick nie zwei Rechnungen erzeugt.
 */
export async function rechnungUebertragen(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  if (aktuellerAnbieter() === "sevdesk") return mitSevdesk(id, (db, client, detail) => sevdeskUebertragen(db, client, detail, sevdeskFinalisieren()));
  const client = lexwareClient();
  if (!client) return { fehler: "Lexware ist noch nicht eingerichtet (der API-Schlüssel fehlt)." };

  const detail = await rechnungLaden(id);
  if (!detail) return { fehler: "Rechnung nicht gefunden." };
  const { rechnung: r, bausteine, kunde } = detail;
  if (r.archiviert) return { fehler: "Diese Rechnung ist archiviert." };
  if (r.status !== "entwurf") return { fehler: "Diese Rechnung ist schon übertragen (oder wird gerade übertragen)." };
  if (!bausteine.some((b) => b.typ === "position")) return { fehler: "Die Rechnung hat keine Position." };

  const supabase = await createClient();
  const { data: reserviert, error: reserviertFehler } = await supabase
    .from("invoices")
    .update({ status: "wird_uebertragen" })
    .eq("id", id)
    .eq("status", "entwurf")
    .select("id");
  if (reserviertFehler) return { fehler: dbMeldung(reserviertFehler) };
  if (!reserviert?.length) return { fehler: "Diese Rechnung wird gerade übertragen oder ist schon übertragen." };

  const zurueck = async () => {
    await supabase.from("invoices").update({ status: "entwurf" }).eq("id", id);
  };

  let lexwareId: string;
  try {
    // 1. Kunde in Lexware (einmalig anlegen, die ID merkt sich die App am Kontakt)
    let kontaktId = kunde.lexwareKontaktId;
    if (!kontaktId) {
      const { data: k } = await supabase
        .from("contacts")
        .select("typ, anrede, firmenname, ansprechpartner, vorname, nachname, strasse, plz, ort, email, leitweg_id")
        .eq("id", r.contactId)
        .maybeSingle();
      if (!k) throw new LexwareFehler(0, "Der Kunde wurde nicht gefunden.");
      kontaktId = await client.kontaktAnlegen(lexwareKontaktPayload(k));
      await supabase.from("contacts").update({ lexware_contact_id: kontaktId }).eq("id", r.contactId);
    }

    // 2. Rechnung anlegen (finalisiert oder als Entwurf)
    const daten: RechnungDaten = {
      betreff: r.betreff,
      rechnungsdatum: r.rechnungsdatum,
      leistungVon: r.leistungVon,
      leistungBis: r.leistungBis,
      zahlungszielTage: r.zahlungszielTage,
      skontoProzent: r.skontoProzent,
      skontoTage: r.skontoTage,
      steuersatz: r.steuersatz,
      reverseCharge: r.reverseCharge,
      rabattProzent: r.rabattProzent,
      einleitung: r.einleitung,
      schlusstext: r.schlusstext,
      leitwegId: kunde.leitwegId,
    };
    lexwareId = await client.rechnungAnlegen(lexwareRechnungPayload(daten, bausteine, kontaktId), lexwareFinalisieren());
  } catch (fehler) {
    await zurueck();
    return { fehler: fehler instanceof LexwareFehler ? fehler.message : "Die Übertragung an Lexware hat nicht geklappt. Bitte nochmal versuchen." };
  }

  // Die Rechnung existiert jetzt in Lexware: SOFORT festhalten, sonst könnte sie ein zweites Mal entstehen.
  const { error: festFehler } = await supabase
    .from("invoices")
    .update({ status: "uebertragen", lexware_id: lexwareId, uebertragen_am: new Date().toISOString() })
    .eq("id", id);
  if (festFehler) {
    console.error("[lexware] Rechnung angelegt, aber nicht gespeichert:", lexwareId);
    return { fehler: `Die Rechnung wurde in Lexware angelegt (ID ${lexwareId}), konnte aber in der App nicht gespeichert werden. Bitte nicht nochmal senden und Mika Bescheid geben.` };
  }

  // Rückmeldung von Lexware (Nummer, Status, Summen) und PDF; Fehler hier sind nicht schlimm, „Abgleichen“ holt es nach.
  let hinweis: string | undefined;
  try {
    const info = await client.rechnungLesen(lexwareId);
    await supabase
      .from("invoices")
      .update({
        rechnungsnummer: info.rechnungsnummer || null,
        lexware_status: info.status || null,
        netto: info.netto,
        brutto: info.brutto,
        abgeglichen_am: new Date().toISOString(),
      })
      .eq("id", id);
    const erwartet = rechnungBerechnen(bausteine, { rabattProzent: r.rabattProzent, steuersatz: r.steuersatz, reverseCharge: r.reverseCharge });
    if (info.netto !== null && Math.abs(info.netto - erwartet.nettoNachRabatt) > 0.01) {
      hinweis = `Achtung: Lexware rechnet netto ${info.netto.toFixed(2).replace(".", ",")} €, die App ${erwartet.nettoNachRabatt.toFixed(2).replace(".", ",")} €. Bitte die Rechnung in Lexware prüfen.`;
    }
    if (info.status === "open" || info.status === "paid") {
      if (!(await dateiSichern(id, lexwareId))) hinweis = `${hinweis ? `${hinweis} ` : ""}Das PDF konnte noch nicht geholt werden. Tippe später auf „Aus Lexware abgleichen“.`;
    } else if (!lexwareFinalisieren()) {
      hinweis = "Die Rechnung liegt in Lexware als Entwurf (Test-Modus). Finalisiere sie dort, dann gleiche sie hier ab.";
    }
  } catch {
    hinweis = "Die Rechnung ist in Lexware angelegt. Nummer und PDF konnten noch nicht geholt werden: tippe gleich auf „Aus Lexware abgleichen“.";
  }
  aktualisieren(id, r.projectId);
  return { id, hinweis };
}

/** Nummer, Status, Summen und (falls noch nicht vorhanden) das PDF aus Lexware holen. */
export async function rechnungAbgleichen(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const detail = await rechnungLaden(id);
  if (!detail) return { fehler: "Rechnung nicht gefunden." };
  if (detail.rechnung.anbieter === "sevdesk") return mitSevdesk(id, (db, client, d) => sevdeskAbgleichen(db, client, d));
  const client = lexwareClient();
  if (!client) return { fehler: "Lexware ist noch nicht eingerichtet (der API-Schlüssel fehlt)." };
  const { rechnung: r } = detail;
  if (!r.lexwareId) return { fehler: "Diese Rechnung ist noch nicht an Lexware übertragen." };

  const supabase = await createClient();
  try {
    const info = await client.rechnungLesen(r.lexwareId);
    const { error } = await supabase
      .from("invoices")
      .update({
        rechnungsnummer: info.rechnungsnummer || null,
        lexware_status: info.status || null,
        netto: info.netto,
        brutto: info.brutto,
        abgeglichen_am: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { fehler: dbMeldung(error) };
    let hinweis: string | undefined;
    if ((info.status === "open" || info.status === "paid") && !r.pdfPfad) {
      if (!(await dateiSichern(id, r.lexwareId))) hinweis = "Das PDF konnte noch nicht geholt werden. Bitte später nochmal abgleichen.";
    } else if (info.status === "draft") {
      hinweis = "Die Rechnung ist in Lexware noch ein Entwurf. Nach dem Finalisieren dort gibt es Nummer und PDF.";
    }
    aktualisieren(id, r.projectId);
    return { id, hinweis };
  } catch (fehler) {
    return { fehler: fehler instanceof LexwareFehler ? fehler.message : "Der Abgleich mit Lexware hat nicht geklappt." };
  }
}

/**
 * Notausgang: Bleibt eine Rechnung im Status „wird übertragen“ hängen (z. B. weil der Server mittendrin abbrach), geht sie nach
 * fünf Minuten zurück auf „Entwurf“. Nur wenn Lexware noch keine Rechnung dazu hat (keine Lexware-ID), sonst könnte sie doppelt entstehen.
 */
export async function rechnungWiederFreigeben(id: string): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Rechnung." };
  const supabase = await createClient();
  const grenze = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "entwurf" })
    .eq("id", id)
    .eq("status", "wird_uebertragen")
    .is("lexware_id", null)
    .lt("updated_at", grenze)
    .select("id, project_id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Die Rechnung lässt sich noch nicht freigeben (sie wird vielleicht gerade übertragen, bitte fünf Minuten warten)." };
  aktualisieren(id, data[0].project_id);
  return { id };
}

/**
 * Vermerkt, wie weit eine offene Rechnung gemahnt wurde (0 = nicht gemahnt, 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = 2. Mahnung).
 * Die Mahnung selbst schreibt das Büro in Lexware; hier steht nur der Vermerk, der in den offenen Forderungen als „Angemahnt“ erscheint.
 */
export async function rechnungMahnstufeSetzen(id: string, stufe: number): Promise<RechnungErgebnis> {
  await requireBueroRecht("rechnungen");
  if (!uuid.safeParse(id).success || !istMahnstufe(stufe)) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data: r } = await supabase.from("invoices").select("status, lexware_status, project_id").eq("id", id).maybeSingle();
  if (!r) return { fehler: "Rechnung nicht gefunden." };
  if (r.status !== "uebertragen" || r.lexware_status !== "open") return { fehler: "Eine Mahnung lässt sich nur bei einer offenen, an Lexware übertragenen Rechnung vermerken." };
  const { error } = await supabase.from("invoices").update({ mahnstufe: stufe, angemahnt_am: stufe > 0 ? heuteIso() : null }).eq("id", id);
  if (error) return { fehler: dbMeldung(error) };
  aktualisieren(id, r.project_id);
  revalidatePath("/buero");
  return { id };
}

/** Notiz zur Rechnung (intern, nicht auf dem PDF). Bleibt auch nach der Übertragung änderbar. */
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
