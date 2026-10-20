import type { Metadata } from "next";
import { requireBueroRecht } from "@/lib/auth";
import { eingabeAusEinstellungen } from "@/lib/rechnung-einstellungen";
import { rechnungsEinstellungenLaden } from "@/lib/rechnung-einstellungen-daten";
import { RechnungenFormular } from "./rechnungen-formular";

export const metadata: Metadata = { title: "Rechnungen – Vorgaben" };

export default async function RechnungenVorgabenSeite() {
  await requireBueroRecht("einstellungen_firma");
  const einstellungen = await rechnungsEinstellungenLaden();
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Rechnungen – Vorgaben</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Zahlungsziel und Skonto der Firma sowie die Mahnstufen. Die Rechnungsnummer und die fertige Rechnung kommen weiter von Lexware Office.
        </p>
      </div>
      <RechnungenFormular start={eingabeAusEinstellungen(einstellungen)} />
    </div>
  );
}
