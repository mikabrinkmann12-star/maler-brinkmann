import type { Metadata } from "next";
import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { imapKonfiguration } from "@/lib/env";
import { kiRechnungKonfiguration } from "@/lib/eingangsrechnung-ki";
import { formatDatumZeit } from "@/lib/format";
import type { AbrufErgebnis } from "@/lib/postfach-abruf";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Postfach für Rechnungen" };

export default async function PostfachSeite() {
  await requireRole(["admin"]);
  const konfig = imapKonfiguration();
  const cron = Boolean(process.env.CRON_SECRET);
  const ki = kiRechnungKonfiguration();
  const { data: stand } = await (await createClient()).from("postfach_status").select("letzter_abruf, ergebnis").eq("id", 1).maybeSingle();
  const letztes = (stand?.ergebnis ?? null) as AbrufErgebnis | null;
  const abrufOk = Boolean(stand?.letzter_abruf) && !(letztes?.fehler ?? []).some((f) => /Anmeldung|Server|Verbindung|Ordner|Postfach konnte/.test(f));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Postfach für Rechnungen</h1>
        <p className="text-muted-foreground">
          Rechnungen von Lieferanten kommen per E-Mail an. Die App holt die Anhänge (PDF, XML-E-Rechnung, größere Fotos) aus einem Postfach ab, liest Nummer, Datum und Beträge automatisch aus und legt sie unter „Eingangsrechnungen“ als „Zu prüfen“ an. In Plancraft heißt das „Eingangsrechnungen per E-Mail hochladen“.
        </p>
      </div>

      <section className="flex flex-col gap-1 rounded-xl border px-4 py-3">
        <p className="flex items-center gap-2 font-medium">
          {stand?.letzter_abruf ? (abrufOk ? <CheckCircle2Icon className="size-5 text-green-600" /> : <CircleAlertIcon className="size-5 text-red-600" />) : <CircleAlertIcon className="size-5 text-muted-foreground" />}
          Letzter Abruf: {stand?.letzter_abruf ? formatDatumZeit(stand.letzter_abruf) : "noch keiner"}
        </p>
        {letztes && (
          <p className="text-sm text-muted-foreground">
            {letztes.mails} neue {letztes.mails === 1 ? "Mail" : "Mails"} angesehen, {letztes.neu} {letztes.neu === 1 ? "Rechnung" : "Rechnungen"} angelegt
            {letztes.doppelt ? `, ${letztes.doppelt} schon vorhanden` : ""}{letztes.weitere ? ", weitere folgen beim nächsten Abruf" : ""}.
          </p>
        )}
        {letztes?.fehler?.length ? (
          <ul className="list-disc pl-5 text-sm text-red-700">{letztes.fehler.slice(0, 5).map((f, i) => <li key={i}>{f}</li>)}</ul>
        ) : null}
        {stand?.letzter_abruf && !abrufOk && <p className="text-sm">Steht hier „Anmeldung fehlgeschlagen“, wurde das Passwort des Postfachs geändert. Dann in Vercel IMAP_PASSWORD neu eintragen.</p>}
      </section>

      <ul className="flex flex-col divide-y rounded-xl border">
        <li className="flex items-start gap-3 px-4 py-3">
          {konfig ? <CheckCircle2Icon className="mt-0.5 size-5 text-green-600" /> : <CircleAlertIcon className="mt-0.5 size-5 text-amber-600" />}
          <div>
            <p className="font-medium">Postfach: {konfig ? `${konfig.user} auf ${konfig.host}, Ordner „${konfig.ordner}“` : "noch nicht eingerichtet"}</p>
            <p className="text-sm text-muted-foreground">
              {konfig
                ? "Das Passwort steht als Umgebungsvariable auf dem Server und ist hier nie sichtbar. Im Büro gibt es auf der Seite „Eingangsrechnungen“ den Knopf „Postfach abrufen“."
                : "Eingetragen werden die Umgebungsvariablen IMAP_HOST, IMAP_USER, IMAP_PASSWORD (optional IMAP_PORT = 993 und IMAP_ORDNER) in Vercel bzw. lokal in .env.local. Die Zugangsdaten gibt der Anbieter des Postfachs (IMAP-Zugang)."}
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3 px-4 py-3">
          {cron ? <CheckCircle2Icon className="mt-0.5 size-5 text-green-600" /> : <CircleAlertIcon className="mt-0.5 size-5 text-amber-600" />}
          <div>
            <p className="font-medium">Automatischer Abruf: {cron ? "eingerichtet (alle 15 Minuten)" : "noch nicht eingerichtet"}</p>
            <p className="text-sm text-muted-foreground">
              {cron
                ? "Ein Zeitplan in der Datenbank (Supabase) ruft die App alle 15 Minuten auf, zusätzlich Vercel einmal am Morgen. Den Stand siehst du oben unter „Letzter Abruf“."
                : "Dafür braucht die App ein Geheimnis: Trage in Vercel die Umgebungsvariable CRON_SECRET ein (ein langer zufälliger Text). Ohne sie bleibt nur der Knopf „Postfach abrufen“."}
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3 px-4 py-3">
          {ki.aktiv ? <CheckCircle2Icon className="mt-0.5 size-5 text-green-600" /> : <CircleAlertIcon className="mt-0.5 size-5 text-muted-foreground" />}
          <div>
            <p className="font-medium">
              KI-Auslesen mit Claude: {ki.aktiv ? `eingeschaltet (${ki.modell})` : ki.grund === "kein-schluessel" ? "Schalter an, aber Schlüssel fehlt" : "ausgeschaltet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {ki.aktiv
                ? "Jede Rechnung außer E-Rechnungen (XML) wird von der Claude-Schnittstelle von Anthropic gelesen, auch Gutschriften werden erkannt. Das Ergebnis ist immer ein Vorschlag („Zu prüfen“). Kosten etwa 2 bis 5 Cent pro Rechnung."
                : "Ausgeschaltet geht keine Rechnung an einen Dienst und es entstehen keine Kosten. Einschalten über die Umgebungsvariablen KI_RECHNUNG_AKTIV=1 und ANTHROPIC_API_KEY (optional KI_MODELL). Vorher klären: Kosten pro Rechnung, Vertrag zur Auftragsverarbeitung mit dem Anbieter, keine Nutzung der Daten zum Training."}
            </p>
          </div>
        </li>
      </ul>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">So funktioniert es</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Am besten ein eigenes Postfach oder ein eigener Ordner nur für Rechnungen (z. B. rechnungen@…). Lieferanten bekommen diese Adresse als Rechnungsadresse, oder man leitet Rechnungs-Mails dorthin weiter.</li>
          <li>Gelesen werden alle <strong>neuen</strong> Mails seit dem letzten Abruf, auch wenn sie schon am Handy geöffnet wurden. Beim allerersten Abruf schaut die App 14 Tage zurück. Im Postfach wird nichts verändert: nichts gelöscht, verschoben oder als gelesen markiert.</li>
          <li>Eine Datei, die es schon gibt (gleicher Inhalt), wird nicht noch einmal angelegt.</li>
          <li>E-Rechnungen (XML/ZUGFeRD) gelten gleich als geprüft, wenn alle wichtigen Felder da sind. Normale PDFs bleiben „Zu prüfen“, bis jemand sie bestätigt.</li>
        </ul>

      </div>
    </div>
  );
}
