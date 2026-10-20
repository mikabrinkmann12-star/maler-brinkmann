import type { Metadata } from "next";
import { requireBueroRecht } from "@/lib/auth";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";
import { ZeiterfassungFormular } from "./formular";

export const metadata: Metadata = { title: "Zeiterfassung" };

export default async function ZeiterfassungEinstellungenSeite() {
  await requireBueroRecht("einstellungen_firma");
  const einstellungen = await zeiterfassungEinstellungen();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Zeiterfassung</h1>
        <p className="text-muted-foreground">
          Gilt für die Mitarbeiter-App. Das Büro darf immer alle Arten und alle Tage eintragen.
        </p>
      </div>
      <ZeiterfassungFormular werte={einstellungen} />
    </div>
  );
}
