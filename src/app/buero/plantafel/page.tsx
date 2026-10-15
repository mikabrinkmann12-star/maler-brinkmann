import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";

export const metadata: Metadata = { title: "Plantafel" };

export default function PlantafelSeite() {
  return (
    <Platzhalter titel="Plantafel" phase="Phase 2">
      Jeden Morgen Mitarbeiter auf Autos und Autos auf Baustellen verteilen,
      per Drag &amp; Drop, mit „wie gestern“ und Wochen-/Monatsansicht.
    </Platzhalter>
  );
}
