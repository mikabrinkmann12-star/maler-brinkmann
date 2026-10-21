import type { Metadata } from "next";
import { CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { aktuellerAnbieter, sevdeskEingerichtet, sevdeskFinalisieren } from "@/lib/buchhaltung";
import { SevdeskVerbindungTesten } from "./verbindung-testen";

export const metadata: Metadata = { title: "Buchhaltung (sevdesk)" };

export default async function SevdeskSeite() {
  await requireRole(["admin"]);
  const eingerichtet = sevdeskEingerichtet();
  const finalisieren = sevdeskFinalisieren();
  const anbieter = aktuellerAnbieter();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Buchhaltung (sevdesk)</h1>
        <p className="text-muted-foreground">
          sevdesk arbeitet im Hintergrund: Rechnungen, Mahnungen, Zahlungen und Stornos bedient ihr komplett in dieser App. sevdesk vergibt die Rechnungsnummer,
          erzeugt die Rechnungsdatei (PDF bzw. E-Rechnung) und führt die Buchhaltung, die der Steuerberater später einsieht. Die App erzeugt selbst nie eine Rechnungsnummer.
        </p>
      </div>

      <ul className="flex flex-col divide-y rounded-xl border">
        <li className="flex items-start gap-3 px-4 py-3">
          {eingerichtet ? <CheckCircle2Icon className="mt-0.5 size-5 text-green-600" /> : <CircleAlertIcon className="mt-0.5 size-5 text-amber-600" />}
          <div>
            <p className="font-medium">API-Token: {eingerichtet ? "hinterlegt" : "fehlt"}</p>
            <p className="text-sm text-muted-foreground">
              {eingerichtet
                ? "Der Token steht als Umgebungsvariable SEVDESK_API_TOKEN auf dem Server. Er ist hier nie sichtbar."
                : "Den Token erzeugst du in sevdesk unter Einstellungen → Benutzer → dein Benutzer → API-Token. Trage ihn in Vercel als Umgebungsvariable SEVDESK_API_TOKEN ein (lokal in .env.local), nie in den Code oder in den Chat. Gebraucht wird ein Tarif mit API-Zugang (derzeit „Buchhaltung Pro“)."}
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3 px-4 py-3">
          {anbieter === "sevdesk" ? <CheckCircle2Icon className="mt-0.5 size-5 text-green-600" /> : <CircleAlertIcon className="mt-0.5 size-5 text-amber-600" />}
          <div>
            <p className="font-medium">Neue Rechnungen gehen an: {anbieter === "sevdesk" ? "sevdesk" : anbieter === "lexware" ? "Lexware Office (alt)" : "noch nirgendwohin"}</p>
            <p className="text-sm text-muted-foreground">
              Standard ist Lexware Office. sevdesk ist nur Reserve und gilt nur, wenn die Variable BUCHHALTUNG_ANBIETER auf „sevdesk“ steht (oder Lexware nicht eingerichtet ist).
              Bereits an einen Anbieter übertragene Rechnungen bleiben dort und lassen sich weiter abgleichen.
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3 px-4 py-3">
          {finalisieren ? <CheckCircle2Icon className="mt-0.5 size-5 text-green-600" /> : <CircleAlertIcon className="mt-0.5 size-5 text-amber-600" />}
          <div>
            <p className="font-medium">Modus: {finalisieren ? "Rechnungen werden sofort fertiggestellt" : "Test-Modus (nur Entwurf in sevdesk)"}</p>
            <p className="text-sm text-muted-foreground">
              {finalisieren
                ? "Beim Fertigstellen markiert sevdesk die Rechnung als versendet (Rechnungsnummer) und die App schreibt sie fest (GoBD). Das ist nicht rücknehmbar. Zum gefahrlosen Ausprobieren setzt du SEVDESK_MODUS auf „entwurf“, dann entsteht in sevdesk nur ein Entwurf."
                : "SEVDESK_MODUS steht auf „entwurf“: Rechnungen landen in sevdesk nur als Entwurf, ohne Rechnungsnummer. Lösche die Variable, wenn echte Rechnungen entstehen sollen."}
            </p>
          </div>
        </li>
      </ul>

      <SevdeskVerbindungTesten eingerichtet={eingerichtet} />

      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p><strong className="text-foreground">Vor dem ersten echten Einsatz</strong> (die Anbindung ist noch nicht mit einem echten sevdesk-Konto geprüft):</p>
        <ol className="list-decimal pl-5">
          <li>In sevdesk einmal Firmendaten, Bankkonto (Konto für Zahlungen) und ggf. Kleinunternehmer-Status einrichten.</li>
          <li>SEVDESK_MODUS=entwurf setzen, eine Probe-Rechnung aus der App übertragen und in sevdesk ansehen (Kunde, Positionen, Steuer, Texte).</li>
          <li>Dann den Modus entfernen und eine Rechnung echt fertigstellen, Nummer und Datei kontrollieren, danach per E-Mail an euch selbst senden.</li>
        </ol>
        <p>Behörden-Rechnungen (Leitweg-ID) gehen als XRechnung raus; dafür braucht sevdesk in den Firmendaten IBAN, BIC, Steuernummer und USt-ID. Abschlagsrechnungen gibt es in der App noch nicht.</p>
      </div>
    </div>
  );
}
