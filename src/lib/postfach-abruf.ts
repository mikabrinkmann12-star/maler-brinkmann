import "server-only";
import { randomUUID } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eingangPfad } from "@/lib/eingangsrechnung";
import { eingangsrechnungAufnehmen } from "@/lib/eingangsrechnung-aufnahme";
import type { ImapKonfiguration } from "@/lib/env";
import { anhaengeAuswaehlen } from "@/lib/postfach-anhaenge";
import type { Database, Json } from "@/lib/supabase/database.types";

// Holt Eingangsrechnungen aus einem Postfach (IMAP). Seit 15.11.2026 (Papa liest seine Mails selbst am Handy): alle NEUEN Mails seit
// dem letzten Abruf, egal ob schon gelesen. Die App merkt sich die letzte gelesene Mail (UID) in `postfach_status`; beim ersten Mal
// (oder wenn das Postfach neu nummeriert wurde) schaut sie 14 Tage zurück. Anhänge (PDF, XML, Bilder) werden wie ein Upload ausgelesen
// und angelegt, doppelte Dateien erkennt die App am Inhalt. Im Postfach wird NICHTS verändert: nichts gelöscht, verschoben oder als
// gelesen markiert (Abruf mit BODY.PEEK). Zeitpunkt und Ergebnis jedes Abrufs stehen in `postfach_status` (Anzeige unter Einstellungen).

export type AbrufErgebnis = {
  mails: number;
  neu: number;
  zuPruefen: number;
  doppelt: number;
  /** Mails ohne brauchbaren Anhang (bleiben gelesen, es wurde nichts angelegt) */
  ohneAnhang: number;
  fehler: string[];
  /** Es gab mehr neue Mails als in einen Abruf passen; der Rest kommt beim nächsten Abruf */
  weitere?: boolean;
};

type Struktur = { type?: string; disposition?: string; dispositionParameters?: Record<string, string>; parameters?: Record<string, string>; childNodes?: Struktur[] };

/** Hat die Mail überhaupt einen Teil, der eine Rechnung sein könnte? (spart das Herunterladen von Mails ohne Anhang) */
export function hatMoeglichenAnhang(s: Struktur | undefined): boolean {
  if (!s) return true; // unbekannt: lieber ansehen
  if (s.childNodes?.length) return s.childNodes.some(hatMoeglichenAnhang);
  const typ = (s.type ?? "").toLowerCase();
  const name = (s.dispositionParameters?.filename ?? s.parameters?.name ?? "").toLowerCase();
  return /^(application\/(pdf|xml|octet-stream)|text\/xml|image\/(jpeg|png))$/.test(typ) || /\.(pdf|xml|jpe?g|png)$/.test(name);
}

const MAX_MAILS = 40;
/** Erstes Mal: so viele Tage zurück */
const START_TAGE = 14;
/** Danach aufhören und beim nächsten Abruf weitermachen (die Abruf-Adresse darf höchstens 60 Sekunden laufen) */
const ZEIT_LIMIT_MS = 40_000;

function imapFehlertext(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string; responseText?: string })?.code ?? "";
  if (/AUTHENTICATIONFAILED|Invalid credentials|authentication failed/i.test(m + code)) return "Anmeldung am Postfach fehlgeschlagen. Benutzername oder Passwort stimmen nicht.";
  if (/ENOTFOUND|EAI_AGAIN/.test(code + m)) return "Der Postfach-Server wurde nicht gefunden. Bitte IMAP_HOST prüfen.";
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET/.test(code + m)) return "Keine Verbindung zum Postfach-Server (Port oder Netz prüfen).";
  if (/mailbox|NONEXISTENT|doesn't exist|does not exist/i.test(m)) return "Der Ordner im Postfach wurde nicht gefunden. Bitte IMAP_ORDNER prüfen.";
  return "Das Postfach konnte nicht abgerufen werden.";
}

export async function postfachAbrufen(
  supabase: SupabaseClient<Database>,
  konfig: ImapKonfiguration,
  eigeneNamen: string[],
): Promise<AbrufErgebnis> {
  const beginn = Date.now();
  const ergebnis: AbrufErgebnis = { mails: 0, neu: 0, zuPruefen: 0, doppelt: 0, ohneAnhang: 0, fehler: [] };
  const { data: stand } = await supabase.from("postfach_status").select("uid_validity, letzte_uid").eq("id", 1).maybeSingle();
  let uidValidity: string | null = stand?.uid_validity ?? null;
  let letzteUid: number | null = stand?.letzte_uid ?? null;

  const client = new ImapFlow({
    host: konfig.host,
    port: konfig.port,
    secure: konfig.port === 993,
    auth: { user: konfig.user, pass: konfig.password },
    logger: false,
    socketTimeout: 60_000,
  });
  client.on("error", () => {
    // Fehler kommen auch über die Aufrufe unten an; hier nur verhindern, dass der Prozess abbricht
  });

  try {
    await client.connect();
    const sperre = await client.getMailboxLock(konfig.ordner);
    try {
      const box = client.mailbox;
      const aktuelleValidity = box && typeof box === "object" ? String(box.uidValidity) : null;
      let uids: number[];
      if (letzteUid === null || uidValidity !== aktuelleValidity) {
        // Erstes Mal oder Postfach neu nummeriert: die letzten Tage ansehen
        const seit = new Date(Date.now() - START_TAGE * 86_400_000);
        uids = (await client.search({ since: seit }, { uid: true })) || [];
        letzteUid = 0;
        uidValidity = aktuelleValidity;
      } else {
        const vorher = letzteUid;
        uids = ((await client.search({ uid: `${vorher + 1}:*` }, { uid: true })) || []).filter((u) => u > vorher);
      }
      uids.sort((a, b) => a - b);
      if (uids.length > MAX_MAILS) ergebnis.weitere = true;

      for (const uid of uids.slice(0, MAX_MAILS)) {
        if (Date.now() - beginn > ZEIT_LIMIT_MS) {
          ergebnis.weitere = true;
          break;
        }
        ergebnis.mails += 1;
        const kopf = await client.fetchOne(String(uid), { bodyStructure: true }, { uid: true });
        if (kopf && !hatMoeglichenAnhang(kopf.bodyStructure as Struktur | undefined)) {
          ergebnis.ohneAnhang += 1;
          letzteUid = uid;
          continue;
        }
        const nachricht = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!nachricht || !nachricht.source) {
          letzteUid = uid;
          continue;
        }
        const mail = await simpleParser(nachricht.source);
        const absender = mail.from?.text ?? "";
        const anhaenge = anhaengeAuswaehlen(
          mail.attachments.map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
            content: a.content,
            contentDisposition: a.contentDisposition,
            related: a.related,
          })),
        );
        if (anhaenge.length === 0) ergebnis.ohneAnhang += 1;

        for (const anhang of anhaenge) {
          const id = randomUUID();
          const { error: uploadFehler } = await supabase.storage
            .from("eingangsrechnungen")
            .upload(eingangPfad(id, anhang.endung), anhang.bytes, { contentType: anhang.typ, upsert: false });
          if (uploadFehler) {
            ergebnis.fehler.push(`„${anhang.dateiname}“ konnte nicht gespeichert werden.`);
            continue;
          }
          const r = await eingangsrechnungAufnehmen(supabase, {
            id,
            endung: anhang.endung,
            dateiname: anhang.dateiname,
            typ: anhang.typ,
            bytes: anhang.bytes,
            quelle: "email",
            absender,
            eigeneNamen,
          });
          if (!r.ok) ergebnis.fehler.push(`„${anhang.dateiname}“: ${r.fehler}`);
          else if (r.doppelt) ergebnis.doppelt += 1;
          else {
            ergebnis.neu += 1;
            if (r.zuPruefen) ergebnis.zuPruefen += 1;
          }
        }
        // Weiter zur nächsten Mail, auch bei einzelnen Fehlern (sonst hinge der Abruf an einer kaputten Mail fest);
        // die Fehler stehen im Ergebnis, die Datei kann man von Hand hochladen.
        letzteUid = uid;
      }
    } finally {
      sperre.release();
    }
  } catch (e) {
    ergebnis.fehler.push(imapFehlertext(e));
  } finally {
    try {
      await client.logout();
    } catch {
      // Verbindung war schon weg
    }
  }

  // Stand merken (auch bei Fehlern: dann sieht man unter Einstellungen, dass und warum es nicht geklappt hat)
  const { error: standFehler } = await supabase.from("postfach_status").upsert({
    id: 1,
    uid_validity: uidValidity,
    letzte_uid: letzteUid,
    letzter_abruf: new Date().toISOString(),
    ergebnis: ergebnis as unknown as Json,
    updated_at: new Date().toISOString(),
  });
  if (standFehler) console.error("[postfach] Der Stand des Abrufs konnte nicht gespeichert werden.");
  return ergebnis;
}
