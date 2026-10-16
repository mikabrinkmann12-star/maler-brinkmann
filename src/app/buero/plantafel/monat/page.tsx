import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { heuteIso, istIsoDatum, monatsGrenzen } from "@/lib/datum";
import { kalenderLaden } from "@/lib/kalender-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { Kalender } from "../kalender";

export const metadata: Metadata = { title: "Plantafel Monat" };

export default async function MonatsSeite({ searchParams }: PageProps<"/buero/plantafel/monat">) {
  await requireRole(BUERO_ROLLEN);
  const { datum: datumParam, ansicht } = await searchParams;
  const datum = istIsoDatum(datumParam) ? datumParam : heuteIso();
  const { erster, letzter } = monatsGrenzen(datum.slice(0, 7));
  const { daten, personen, projektNamen } = await kalenderLaden(erster, letzter);
  return (
    <div className="max-w-full">
      <Kalender modus="monat" datum={datum} ansicht={ansicht === "projekte" ? "projekte" : "mitarbeiter"}
        daten={daten} personen={personen} projektNamen={projektNamen} />
    </div>
  );
}
