import type { Metadata } from "next";
import { requireBueroRecht } from "@/lib/auth";
import { kalkulationLaden } from "@/lib/kalkulation-daten";
import { KalkulationInhalt } from "../../katalog/kalkulation-fenster";

export const metadata: Metadata = { title: "Lohngruppen & Zuschläge" };

export default async function KalkulationEinstellungenSeite() {
  await requireBueroRecht("kalkulation_aendern");
  const einstellungen = await kalkulationLaden();
  return (
    <div className="flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Lohngruppen &amp; Zuschläge</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Hier stellst du ein, wie aus Kosten Verkaufspreise werden. Dasselbe findest du in den Stammdaten unter „Kalkulation“.
        </p>
      </div>
      <KalkulationInhalt einstellungen={einstellungen} istAdmin />
    </div>
  );
}
