import type { Metadata } from "next";
import { requireBueroRecht } from "@/lib/auth";
import { projektnummerStart, projektnummerVorschlag } from "@/lib/projektnummer-daten";
import { KUNDENNUMMER_BEISPIEL } from "@/lib/kundennummer";
import { NummernkreisFormular } from "./formular";

export const metadata: Metadata = { title: "Nummernkreise" };

export default async function NummernkreiseSeite() {
  await requireBueroRecht("einstellungen_firma");
  const [start, vorschlag] = await Promise.all([projektnummerStart(), projektnummerVorschlag()]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Nummernkreise</h1>
        <p className="text-muted-foreground">
          Projektnummern haben das Format <strong>P-(2400)NNN</strong> (wie in Plancraft, der Kopf ist fest) und zählen ohne Neustart weiter.
          Kundennummern (z. B. {KUNDENNUMMER_BEISPIEL}) zählen automatisch ab der höchsten vorhandenen Nummer.
          Rechnungsnummern vergibt Lexware, nicht die App.
        </p>
      </div>
      <NummernkreisFormular start={start} vorschlag={vorschlag} />
    </div>
  );
}
