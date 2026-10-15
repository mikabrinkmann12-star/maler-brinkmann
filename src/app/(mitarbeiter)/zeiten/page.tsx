import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";

export const metadata: Metadata = { title: "Zeiten" };

export default function ZeitenSeite() {
  return (
    <Platzhalter titel="Meine Zeiten" phase="Phase 1">
      Zeit eintragen mit wenigen Taps und eigene Zeiten der letzten Tage
      bearbeiten.
    </Platzhalter>
  );
}
