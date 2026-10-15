import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";
import { requireRole } from "@/lib/auth";
import { formatDatumLang } from "@/lib/format";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { Hinweise } from "./hinweise";

export const metadata: Metadata = { title: "Übersicht" };

export default async function BueroUebersicht() {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const supabase = await createClient();
  const { data: hinweise } = await supabase
    .from("notifications")
    .select("id, text, project_id, created_at")
    .is("gelesen_am", null)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-muted-foreground">{formatDatumLang(new Date())}</p>
        <p className="text-lg">Moin, {nutzer.vorname}!</p>
      </div>
      <Hinweise hinweise={hinweise ?? []} />
      <Platzhalter titel="Übersicht" phase="Phase 6">
        Hier entsteht das Dashboard: zuletzt bearbeitete Projekte, offene
        Forderungen, offene Urlaubsanträge und das Wetter im Saterland.
      </Platzhalter>
    </div>
  );
}
