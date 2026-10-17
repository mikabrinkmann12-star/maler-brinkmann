import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, CheckCircle2Icon, CircleAlertIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { lexwareEingerichtet, lexwareFinalisieren } from "@/lib/lexware";
import { VerbindungTesten } from "./verbindung-testen";

export const metadata: Metadata = { title: "Lexware Office" };

export default async function LexwareSeite() {
  await requireRole(["admin"]);
  const eingerichtet = lexwareEingerichtet();
  const finalisieren = lexwareFinalisieren();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/buero/einstellungen" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Einstellungen
        </Link>
        <h1 className="text-2xl font-semibold">Lexware Office</h1>
        <p className="text-muted-foreground">
          Rechnungen werden in der App vorbereitet und an Lexware Office übertragen. Lexware vergibt die Rechnungsnummer und erzeugt das PDF, beides kommt zurück in die App.
        </p>
      </div>

      <ul className="flex flex-col divide-y rounded-xl border">
        <li className="flex items-start gap-3 px-4 py-3">
          {eingerichtet ? <CheckCircle2Icon className="mt-0.5 size-5 text-green-600" /> : <CircleAlertIcon className="mt-0.5 size-5 text-amber-600" />}
          <div>
            <p className="font-medium">API-Schlüssel: {eingerichtet ? "hinterlegt" : "fehlt"}</p>
            <p className="text-sm text-muted-foreground">
              {eingerichtet
                ? "Der Schlüssel steht als Umgebungsvariable LEXWARE_API_KEY auf dem Server. Er ist hier nie sichtbar."
                : "Den Schlüssel erzeugst du in Lexware Office unter app.lexware.de/addons/public-api. Trage ihn in Vercel als Umgebungsvariable LEXWARE_API_KEY ein (lokal in .env.local), nie in den Code oder in den Chat."}
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3 px-4 py-3">
          {finalisieren ? <CheckCircle2Icon className="mt-0.5 size-5 text-green-600" /> : <CircleAlertIcon className="mt-0.5 size-5 text-amber-600" />}
          <div>
            <p className="font-medium">Modus: {finalisieren ? "Rechnungen werden sofort finalisiert" : "Test-Modus (nur Entwurf in Lexware)"}</p>
            <p className="text-sm text-muted-foreground">
              {finalisieren
                ? "Beim Senden erzeugt Lexware die fertige Rechnung mit Nummer. Das ist nicht rücknehmbar. Zum gefahrlosen Ausprobieren setzt du die Variable LEXWARE_MODUS auf „entwurf“, dann entsteht in Lexware nur ein Entwurf."
                : "Die Variable LEXWARE_MODUS steht auf „entwurf“: Rechnungen landen in Lexware nur als Entwurf, ohne Rechnungsnummer. Lösche die Variable, wenn echte Rechnungen entstehen sollen."}
            </p>
          </div>
        </li>
      </ul>

      <VerbindungTesten eingerichtet={eingerichtet} />

      <p className="text-sm text-muted-foreground">
        Hinweise: Lexware erlaubt höchstens 2 Anfragen pro Sekunde, die App wartet deshalb zwischen den Anfragen. Abschlagsrechnungen kann die Schnittstelle nicht anlegen, die bleiben in Lexware.
        Der Kunde wird beim ersten Mal in Lexware angelegt; prüfe in Lexware, dass es ihn nicht schon gab.
      </p>
    </div>
  );
}
