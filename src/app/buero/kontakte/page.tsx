import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";

export const metadata: Metadata = { title: "Kontakte" };

export default function KontakteSeite() {
  return (
    <Platzhalter titel="Kontakte" phase="Phase 3">
      Kunden (Firmen und Privat) mit Adresse, Ansprechpartner und Notizen,
      inklusive Import aus Plancraft.
    </Platzhalter>
  );
}
