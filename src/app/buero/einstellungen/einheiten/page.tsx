import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { einheitenLaden } from "@/lib/einheiten-daten";
import { EinheitenFormular } from "./einheiten-formular";

export const metadata: Metadata = { title: "Einheiten" };

export default async function EinheitenSeite() {
  await requireRole(["admin"]);
  const einheiten = await einheitenLaden();
  return (
    <div className="flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Einheiten</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Die Einheiten für Leistungen, Materialien und Positionen im Angebot und in der Rechnung.</p>
      </div>
      <EinheitenFormular start={einheiten} />
    </div>
  );
}
