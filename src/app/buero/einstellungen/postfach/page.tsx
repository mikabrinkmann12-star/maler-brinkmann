import type { Metadata } from "next";
import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { imapKonfiguration } from "@/lib/env";

export const metadata: Metadata = { title: "Postfach für Rechnungen" };

export default async function PostfachSeite() {
  await requireRole(["admin"]);
  const konfig = imapKonfiguration();
  const cron = Boolean(process.env.CRON_SECRET);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Postfach für Rechnungen</h1>
        <p className="text-muted-foreground">
          Rechnungen von Lieferanten kommen per E-Mail an. Die App holt die Anhänge (PDF, XML-E-Rechnung, größere Fotos) aus einem Postfach ab, liest Nummer, Datum und Beträge automatisch aus und legt sie unter „Eingangsrechnungen“ als „Zu prüfen“ an. In Plancraft heißt das „Eingangsrechnungen per E-Mail hochladen“.
        </p>
      </div>

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
            <p className="font-medium">Täglicher Abruf: {cron ? "eingerichtet (jeden Morgen gegen 6 Uhr)" : "noch nicht eingerichtet"}</p>
            <p className="text-sm text-muted-foreground">
              {cron
                ? "Vercel ruft die App einmal am Tag auf und holt neue Rechnungen ab. Mit Vercel Pro lässt sich der Zeitplan in vercel.json auf z. B. alle 15 Minuten stellen."
                : "Dafür braucht die App ein Geheimnis: Trage in Vercel die Umgebungsvariable CRON_SECRET ein (ein langer zufälliger Text). Ohne sie bleibt nur der Knopf „Postfach abrufen“."}
            </p>
          </div>
        </li>
      </ul>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">So funktioniert es</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Am besten ein eigenes Postfach oder ein eigener Ordner nur für Rechnungen (z. B. rechnungen@…). Lieferanten bekommen diese Adresse als Rechnungsadresse, oder man leitet Rechnungs-Mails dorthin weiter.</li>
          <li>Gelesen werden nur <strong>ungelesene</strong> Mails. Nach dem Anlegen gilt die Mail als gelesen. Es wird nie etwas im Postfach gelöscht oder verschoben.</li>
          <li>Eine Datei, die es schon gibt (gleicher Inhalt), wird nicht noch einmal angelegt.</li>
          <li>E-Rechnungen (XML/ZUGFeRD) gelten gleich als geprüft, wenn alle wichtigen Felder da sind. Normale PDFs bleiben „Zu prüfen“, bis jemand sie bestätigt.</li>
        </ul>
        <p>Hinweis: Der Abruf wurde mit einem Test-Postfach noch nicht ausprobiert. Beim ersten echten Einsatz bitte zuerst einen Probelauf mit ein bis zwei Mails machen.</p>
      </div>
    </div>
  );
}
