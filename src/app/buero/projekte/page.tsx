import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";

export const metadata: Metadata = { title: "Projekte" };

export default function ProjekteSeite() {
  return (
    <Platzhalter titel="Projekte" phase="Phase 3">
      Projektliste mit Suche und Filtern sowie eine Detailseite mit Zeiten,
      Fotos, Notizen, Material, Aufmaß und Dokumenten.
    </Platzhalter>
  );
}
