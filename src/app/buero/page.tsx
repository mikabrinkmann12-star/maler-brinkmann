import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";
import { requireRole } from "@/lib/auth";
import { formatDatumLang } from "@/lib/format";
import { BUERO_ROLLEN } from "@/lib/rollen";

export const metadata: Metadata = { title: "Übersicht" };

export default async function BueroUebersicht() {
  const nutzer = await requireRole(BUERO_ROLLEN);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-muted-foreground">{formatDatumLang(new Date())}</p>
        <p className="text-lg">Moin, {nutzer.vorname}!</p>
      </div>
      <Platzhalter titel="Übersicht" phase="Phase 6">
        Hier entsteht das Dashboard: zuletzt bearbeitete Projekte, offene
        Forderungen, offene Urlaubsanträge und das Wetter im Saterland.
      </Platzhalter>
    </div>
  );
}
