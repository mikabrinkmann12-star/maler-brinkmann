import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";

export const metadata: Metadata = { title: "Baustellen" };

export default function BaustellenSeite() {
  return (
    <Platzhalter titel="Meine Baustellen" phase="Phase 1">
      Alle Baustellen, auf denen du eingetragen bist. Dort kannst du auch
      Kollegen hinzufügen, Fotos, Notizen, Material und Aufmaß erfassen.
    </Platzhalter>
  );
}
