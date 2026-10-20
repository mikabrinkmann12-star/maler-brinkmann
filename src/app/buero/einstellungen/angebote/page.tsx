import type { Metadata } from "next";
import { requireBueroRecht } from "@/lib/auth";
import { angebotEinstellungenLaden } from "@/lib/firma-daten";
import { AngebotEinstellungenFormular } from "./formular";

export const metadata: Metadata = { title: "Angebote – Vorgaben" };

export default async function AngebotEinstellungenSeite() {
  await requireBueroRecht("einstellungen_firma");
  const werte = await angebotEinstellungenLaden();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Angebote – Vorgaben</h1>
        <p className="text-muted-foreground">
          Diese Texte und Werte werden in jedes <strong>neue</strong> Angebot kopiert. Bestehende Angebote ändern sich nicht.
        </p>
      </div>
      <AngebotEinstellungenFormular werte={werte} />
    </div>
  );
}
