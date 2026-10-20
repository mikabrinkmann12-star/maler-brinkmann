import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { heuteIso } from "@/lib/datum";
import { rechnungBerechnen, type RechnungDaten } from "@/lib/rechnung";
import type { RechnungDetail } from "@/lib/rechnung-daten";
import type { RechnungMailEingabe } from "@/lib/rechnung-mail";
import { SevdeskFehler, type SevdeskClient } from "@/lib/sevdesk-client";
import { sevdeskKontaktEingabe, sevdeskRechnungKoerper } from "@/lib/sevdesk-rechnung";
import type { Database } from "@/lib/supabase/database.types";

// Die Abläufe mit sevdesk (Rechnung übertragen, abgleichen, per E-Mail senden, Zahlung buchen, Mahnung, Storno). Wer sie aufruft, hat vorher
// requireRole(BUERO_ROLLEN) geprüft; `supabase` ist der Client des eingeloggten Nutzers (RLS). HARTE REGEL: Nummer und Datei kommen von sevdesk.
// Mit einem echten sevdesk-Konto sind diese Abläufe noch nicht geprüft (nur gegen einen Schein-Server).

type Db = SupabaseClient<Database>;
export type Ergebnis = { fehler?: string; id?: string; hinweis?: string };

const euro = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
const meldung = (f: unknown, vorgabe: string) => (f instanceof SevdeskFehler ? f.message : vorgabe);

function dbMeldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "P0001") return fehler.message;
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

/** Original-Datei aus sevdesk holen und als Kopie in der App ablegen: PDF (bei E-Rechnungen mit eingebettetem XML), bei Behörden-Rechnungen (Leitweg-ID) die XML-Datei. */
async function dateiSichern(db: Db, client: SevdeskClient, rechnungId: string, sevdeskId: string, alsXml: boolean): Promise<boolean> {
  try {
    let bytes: Uint8Array;
    let xml = false;
    if (alsXml) {
      try {
        bytes = await client.rechnungXml(sevdeskId);
        xml = true;
      } catch {
        bytes = await client.rechnungPdf(sevdeskId);
      }
    } else {
      bytes = await client.rechnungPdf(sevdeskId);
    }
    const pfad = `${rechnungId}.${xml ? "xml" : "pdf"}`;
    const { error } = await db.storage.from("rechnungen").upload(pfad, bytes, { contentType: xml ? "application/xml" : "application/pdf", upsert: true });
    if (error) return false;
    const { error: dbFehler } = await db.from("invoices").update({ pdf_pfad: pfad }).eq("id", rechnungId);
    return !dbFehler;
  } catch {
    return false;
  }
}

/** Nummer, Status und Summen aus sevdesk in die Rechnung schreiben. Eine storniert vermerkte Rechnung bleibt storniert. */
async function infoSpeichern(db: Db, client: SevdeskClient, detail: RechnungDetail, sevdeskId: string) {
  const info = await client.rechnungLesen(sevdeskId);
  const storniert = detail.rechnung.lexwareStatus === "voided";
  const { error } = await db
    .from("invoices")
    .update({
      rechnungsnummer: info.rechnungsnummer || null,
      lexware_status: storniert ? "voided" : info.status || null,
      netto: info.netto,
      brutto: info.brutto,
      abgeglichen_am: new Date().toISOString(),
      ...(info.status === "paid" && !detail.rechnung.bezahltAm ? { bezahlt_am: heuteIso() } : {}),
    })
    .eq("id", detail.rechnung.id);
  return { info, fehler: error ? dbMeldung(error) : null };
}

/**
 * Rechnung an sevdesk übertragen. Standard: sevdesk legt sie an und markiert sie als versendet (vergibt die Rechnungsnummer), dann wird sie
 * festgeschrieben (GoBD, nicht rücknehmbar). Mit `finalisieren = false` (SEVDESK_MODUS=entwurf) bleibt es ein Entwurf in sevdesk.
 * Zuerst wird die Rechnung hier „reserviert“ (Status wird_uebertragen), damit ein Doppelklick nie zwei Rechnungen erzeugt.
 */
export async function sevdeskUebertragen(db: Db, client: SevdeskClient, detail: RechnungDetail, finalisieren: boolean): Promise<Ergebnis> {
  const { rechnung: r, bausteine, kunde } = detail;
  if (r.archiviert) return { fehler: "Diese Rechnung ist archiviert." };
  if (r.status !== "entwurf") return { fehler: "Diese Rechnung ist schon übertragen (oder wird gerade übertragen)." };
  if (!bausteine.some((b) => b.typ === "position")) return { fehler: "Die Rechnung hat keine Position." };

  const { data: reserviert, error: reserviertFehler } = await db
    .from("invoices")
    .update({ status: "wird_uebertragen", anbieter: "sevdesk" })
    .eq("id", r.id)
    .eq("status", "entwurf")
    .select("id");
  if (reserviertFehler) return { fehler: dbMeldung(reserviertFehler) };
  if (!reserviert?.length) return { fehler: "Diese Rechnung wird gerade übertragen oder ist schon übertragen." };

  const zurueck = async () => {
    await db.from("invoices").update({ status: "entwurf", anbieter: "lexware" }).eq("id", r.id);
  };

  let sevdeskId: string;
  try {
    // 1. Kunde in sevdesk (einmalig anlegen, die ID merkt sich die App am Kontakt)
    let kontaktId = kunde.sevdeskKontaktId;
    if (!kontaktId) {
      const { data: k } = await db
        .from("contacts")
        .select("typ, anrede, firmenname, ansprechpartner, vorname, nachname, strasse, plz, ort, email, leitweg_id, kundennummer")
        .eq("id", r.contactId)
        .maybeSingle();
      if (!k) throw new SevdeskFehler(0, "Der Kunde wurde nicht gefunden.");
      kontaktId = await client.kontaktAnlegen(sevdeskKontaktEingabe(k));
      await db.from("contacts").update({ sevdesk_contact_id: kontaktId }).eq("id", r.contactId);
    }

    // 2. Rechnungsentwurf anlegen
    const [benutzer, einheiten] = await Promise.all([client.ersterBenutzer(), client.einheiten()]);
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
    sevdeskId = await client.rechnungAnlegen(sevdeskRechnungKoerper(daten, bausteine, { kontaktId, benutzerId: benutzer.id, einheiten }));
  } catch (fehler) {
    await zurueck();
    return { fehler: meldung(fehler, "Die Übertragung an sevdesk hat nicht geklappt. Bitte nochmal versuchen.") };
  }

  // Die Rechnung existiert jetzt in sevdesk: SOFORT festhalten, sonst könnte sie ein zweites Mal entstehen.
  const { error: festFehler } = await db
    .from("invoices")
    .update({ status: "uebertragen", sevdesk_id: sevdeskId, anbieter: "sevdesk", lexware_status: "draft", uebertragen_am: new Date().toISOString() })
    .eq("id", r.id);
  if (festFehler) {
    console.error("[sevdesk] Rechnung angelegt, aber nicht gespeichert:", sevdeskId);
    return { fehler: `Die Rechnung wurde in sevdesk angelegt (ID ${sevdeskId}), konnte aber in der App nicht gespeichert werden. Bitte nicht nochmal senden und Mika Bescheid geben.` };
  }

  const hinweise: string[] = [];
  try {
    if (finalisieren) {
      await client.alsVersendetMarkieren(sevdeskId, "VPDF");
      try {
        await client.festschreiben(sevdeskId);
      } catch {
        hinweise.push("Die Rechnung konnte noch nicht festgeschrieben werden (wird beim nächsten Abgleich erneut versucht).");
      }
    } else {
      hinweise.push("Test-Modus: Die Rechnung liegt in sevdesk nur als Entwurf, ohne Rechnungsnummer.");
    }

    const { info, fehler } = await infoSpeichern(db, client, detail, sevdeskId);
    if (fehler) hinweise.push(fehler);
    const erwartet = rechnungBerechnen(bausteine, { rabattProzent: r.rabattProzent, steuersatz: r.steuersatz, reverseCharge: r.reverseCharge });
    if (info.netto !== null && Math.abs(info.netto - erwartet.nettoNachRabatt) > 0.01) {
      hinweise.push(`Achtung: sevdesk rechnet netto ${euro(info.netto)}, die App ${euro(erwartet.nettoNachRabatt)}. Bitte die Rechnung prüfen.`);
    }
    if (finalisieren && info.status !== "draft" && !(await dateiSichern(db, client, r.id, sevdeskId, Boolean(kunde.leitwegId)))) {
      hinweise.push("Die Rechnungsdatei konnte noch nicht geholt werden. Bitte gleich auf „Abgleichen“ tippen.");
    }
  } catch (fehler) {
    hinweise.push(`Die Rechnung ist angelegt, aber der Abschluss hat nicht geklappt (${meldung(fehler, "unbekannter Fehler")}). Bitte gleich auf „Abgleichen“ tippen.`);
  }
  return { id: r.id, hinweis: hinweise.length ? hinweise.join(" ") : undefined };
}

/** Nummer, Status, Summen und (falls noch nicht vorhanden) die Datei aus sevdesk holen. Zahlungen, die in sevdesk gebucht wurden, kommen so in die App. */
export async function sevdeskAbgleichen(db: Db, client: SevdeskClient, detail: RechnungDetail): Promise<Ergebnis> {
  const r = detail.rechnung;
  if (!r.sevdeskId) return { fehler: "Diese Rechnung ist noch nicht an sevdesk übertragen." };
  try {
    const { info, fehler } = await infoSpeichern(db, client, detail, r.sevdeskId);
    if (fehler) return { fehler };
    const hinweise: string[] = [];
    if (info.status === "draft") hinweise.push("Die Rechnung ist in sevdesk noch ein Entwurf. Nach dem Versenden gibt es Nummer und Datei.");
    if (info.status !== "draft" && !info.festgeschrieben) {
      try {
        await client.festschreiben(r.sevdeskId);
      } catch {
        // wird beim nächsten Abgleich erneut versucht
      }
    }
    if (info.status !== "draft" && !r.pdfPfad && !(await dateiSichern(db, client, r.id, r.sevdeskId, Boolean(detail.kunde.leitwegId)))) {
      hinweise.push("Die Rechnungsdatei konnte noch nicht geholt werden. Bitte später nochmal abgleichen.");
    }
    return { id: r.id, hinweis: hinweise.length ? hinweise.join(" ") : undefined };
  } catch (fehler) {
    return { fehler: meldung(fehler, "Der Abgleich mit sevdesk hat nicht geklappt.") };
  }
}

/** Rechnung per E-Mail an den Kunden schicken (sevdesk hängt PDF bzw. bei einer XRechnung die XML-Datei an). */
export async function sevdeskPerMail(db: Db, client: SevdeskClient, detail: RechnungDetail, mail: RechnungMailEingabe): Promise<Ergebnis> {
  const r = detail.rechnung;
  if (!r.sevdeskId || r.status !== "uebertragen") return { fehler: "Die Rechnung ist noch nicht übertragen." };
  if (r.lexwareStatus === "voided") return { fehler: "Eine stornierte Rechnung lässt sich nicht mehr senden." };
  try {
    await client.perMailSenden(r.sevdeskId, { an: mail.an, betreff: mail.betreff, text: mail.text, xmlStattPdf: Boolean(detail.kunde.leitwegId) });
  } catch (fehler) {
    return { fehler: meldung(fehler, "Die E-Mail konnte nicht gesendet werden. Bitte nochmal versuchen.") };
  }
  const { error } = await db.from("invoices").update({ versendet_am: new Date().toISOString(), versendet_an: mail.an }).eq("id", r.id);
  if (error) return { id: r.id, hinweis: "Die E-Mail wurde gesendet, der Vermerk konnte aber nicht gespeichert werden." };
  // Versenden setzt die Rechnung in sevdesk auf „offen“ (falls sie noch Entwurf war): Stand nachziehen
  try {
    await infoSpeichern(db, client, detail, r.sevdeskId);
  } catch {
    // nicht schlimm, „Abgleichen“ holt es nach
  }
  return { id: r.id };
}

/** Zahlung buchen (voller Betrag, Eingang heute oder am gewählten Tag). Bucht auf das erste aktive Konto in sevdesk. */
export async function sevdeskBezahltBuchen(db: Db, client: SevdeskClient, detail: RechnungDetail, datum: string): Promise<Ergebnis> {
  const r = detail.rechnung;
  if (!r.sevdeskId || r.status !== "uebertragen") return { fehler: "Die Rechnung ist noch nicht übertragen." };
  if (r.lexwareStatus === "paid") return { fehler: "Diese Rechnung ist schon bezahlt." };
  if (r.lexwareStatus !== "open") return { fehler: "Nur eine offene Rechnung lässt sich als bezahlt buchen." };
  if (r.brutto === null) return { fehler: "Der Rechnungsbetrag ist noch nicht bekannt. Bitte erst abgleichen." };
  try {
    const kontoId = await client.zahlungskonto();
    await client.zahlungBuchen(r.sevdeskId, { betrag: r.brutto, datum, kontoId });
    const { info } = await infoSpeichern(db, client, detail, r.sevdeskId);
    if (info.status !== "paid") return { id: r.id, hinweis: info.teilbezahlt ? "sevdesk meldet die Rechnung als teilweise bezahlt. Bitte dort prüfen." : "Die Zahlung ist gebucht, sevdesk meldet die Rechnung aber noch nicht als bezahlt. Bitte gleich abgleichen." };
    await db.from("invoices").update({ bezahlt_am: datum }).eq("id", r.id);
    return { id: r.id };
  } catch (fehler) {
    return { fehler: meldung(fehler, "Die Zahlung konnte nicht gebucht werden.") };
  }
}

/** Zahlungserinnerung bzw. Mahnung in sevdesk anlegen und per E-Mail schicken; danach steht die Mahnstufe in der App. */
export async function sevdeskMahnen(db: Db, client: SevdeskClient, detail: RechnungDetail, stufe: number, mail: RechnungMailEingabe): Promise<Ergebnis> {
  const r = detail.rechnung;
  if (!r.sevdeskId || r.status !== "uebertragen") return { fehler: "Die Rechnung ist noch nicht übertragen." };
  if (r.lexwareStatus !== "open") return { fehler: "Eine Mahnung gibt es nur bei einer offenen Rechnung." };
  if (![1, 2, 3].includes(stufe) || stufe <= r.mahnstufe) return { fehler: "Diese Mahnstufe ist schon erledigt oder ungültig." };

  let mahnungId: string;
  try {
    mahnungId = await client.mahnungAnlegen(r.sevdeskId);
  } catch (fehler) {
    return { fehler: meldung(fehler, "Die Mahnung konnte in sevdesk nicht angelegt werden.") };
  }
  const { data: zeile, error } = await db.from("invoice_reminders").insert({ invoice_id: r.id, stufe, sevdesk_id: mahnungId }).select("id").single();
  if (error) return { fehler: `Die Mahnung wurde in sevdesk angelegt (ID ${mahnungId}), konnte aber in der App nicht gespeichert werden. Bitte nicht nochmal senden und Mika Bescheid geben.` };

  try {
    await client.perMailSenden(mahnungId, { an: mail.an, betreff: mail.betreff, text: mail.text });
  } catch (fehler) {
    return { id: r.id, fehler: `${meldung(fehler, "Die E-Mail konnte nicht gesendet werden.")} Die Mahnung liegt in sevdesk bereit, bitte hier nicht nochmal anlegen, sondern Mika Bescheid geben.` };
  }
  await db.from("invoice_reminders").update({ versendet_an: mail.an, versendet_am: new Date().toISOString() }).eq("id", zeile.id);
  await db.from("invoices").update({ mahnstufe: stufe, angemahnt_am: heuteIso() }).eq("id", r.id);
  return { id: r.id };
}

/** Rechnung stornieren: sevdesk legt eine Stornorechnung an, die Rechnung gilt danach als storniert. Nicht rücknehmbar. */
export async function sevdeskStornieren(db: Db, client: SevdeskClient, detail: RechnungDetail): Promise<Ergebnis> {
  const r = detail.rechnung;
  if (!r.sevdeskId || r.status !== "uebertragen") return { fehler: "Die Rechnung ist noch nicht übertragen." };
  if (r.lexwareStatus === "voided") return { fehler: "Diese Rechnung ist schon storniert." };
  if (r.lexwareStatus === "draft") return { fehler: "Ein Entwurf lässt sich nicht stornieren. Bitte erst abgleichen." };
  try {
    await client.stornieren(r.sevdeskId);
  } catch (fehler) {
    return { fehler: meldung(fehler, "Die Rechnung konnte nicht storniert werden.") };
  }
  const { error } = await db.from("invoices").update({ lexware_status: "voided", storniert_am: new Date().toISOString() }).eq("id", r.id);
  if (error) return { fehler: "In sevdesk ist die Rechnung storniert, der Vermerk in der App konnte aber nicht gespeichert werden. Bitte gleich abgleichen." };
  return { id: r.id };
}
