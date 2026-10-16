import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { heuteIso, istIsoDatum, tageVerschieben } from "@/lib/datum";
import { wochenAnfang } from "@/lib/kalender";
import { kalenderLaden } from "@/lib/kalender-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { Kalender } from "../kalender";

export const metadata: Metadata = { title: "Plantafel Woche" };

export default async function WochenSeite({ searchParams }: PageProps<"/buero/plantafel/woche">) {
  await requireRole(BUERO_ROLLEN);
  const { datum: datumParam, ansicht } = await searchParams;
  const datum = istIsoDatum(datumParam) ? datumParam : heuteIso();
  const von = wochenAnfang(datum);
  const { daten, personen, projektNamen } = await kalenderLaden(von, tageVerschieben(von, 6));
  return (
    <div className="max-w-full">
      <Kalender modus="woche" datum={datum} ansicht={ansicht === "projekte" ? "projekte" : "mitarbeiter"}
        daten={daten} personen={personen} projektNamen={projektNamen} />
    </div>
  );
}
