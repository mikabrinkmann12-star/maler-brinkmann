import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";

export const metadata: Metadata = { title: "Zeiten" };

export default function BueroZeitenSeite() {
  return (
    <Platzhalter titel="Zeiten" phase="Phase 3">
      Zeiten aller Mitarbeiter mit Filtern, Summen, Überstunden, Urlaub/Krank
      und Export für den Lohn.
    </Platzhalter>
  );
}
