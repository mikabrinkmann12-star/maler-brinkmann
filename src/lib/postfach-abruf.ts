import "server-only";
import { randomUUID } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eingangPfad } from "@/lib/eingangsrechnung";
import { eingangsrechnungAufnehmen } from "@/lib/eingangsrechnung-aufnahme";
import type { ImapKonfiguration } from "@/lib/env";
import { anhaengeAuswaehlen } from "@/lib/postfach-anhaenge";
import type { Database } from "@/lib/supabase/database.types";

// Holt Eingangsrechnungen aus einem Postfach (IMAP): ungelesene Mails, deren Anhänge (PDF, XML, Bilder) werden wie ein Upload
// ausgelesen und angelegt; die Mail gilt danach als gelesen. Es wird nie etwas im Postfach gelöscht oder verschoben.
// Nicht gegen ein echtes Postfach getestet (nur der Anhangs-Teil ist getestet).

export type AbrufErgebnis = {
  mails: number;
  neu: number;
  zuPruefen: number;
  doppelt: number;
  /** Mails ohne brauchbaren Anhang (bleiben gelesen, es wurde nichts angelegt) */
  ohneAnhang: number;
  fehler: string[];
};

const MAX_MAILS = 25;

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
  const ergebnis: AbrufErgebnis = { mails: 0, neu: 0, zuPruefen: 0, doppelt: 0, ohneAnhang: 0, fehler: [] };
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
      const gefunden = await client.search({ seen: false }, { uid: true });
      const uids = (gefunden || []).slice(0, MAX_MAILS);
      for (const uid of uids) {
        ergebnis.mails += 1;
        const nachricht = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!nachricht || !nachricht.source) continue;
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

        let alleOk = true;
        for (const anhang of anhaenge) {
          const id = randomUUID();
          const { error: uploadFehler } = await supabase.storage
            .from("eingangsrechnungen")
            .upload(eingangPfad(id, anhang.endung), anhang.bytes, { contentType: anhang.typ, upsert: false });
          if (uploadFehler) {
            alleOk = false;
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
          if (!r.ok) {
            alleOk = false;
            ergebnis.fehler.push(`„${anhang.dateiname}“: ${r.fehler}`);
          } else if (r.doppelt) ergebnis.doppelt += 1;
          else {
            ergebnis.neu += 1;
            if (r.zuPruefen) ergebnis.zuPruefen += 1;
          }
        }
        // Nur als gelesen markieren, wenn alles geklappt hat: sonst wird die Mail beim nächsten Abruf nochmal versucht
        if (alleOk) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
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
  return ergebnis;
}
