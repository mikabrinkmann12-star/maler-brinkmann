import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";
import { requireRole } from "@/lib/auth";
import { formatDatumLang } from "@/lib/format";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { Hinweise } from "./hinweise";
import { MaterialMeldungen, type OffeneMeldung } from "./material-meldungen";

export const metadata: Metadata = { title: "Übersicht" };

export default async function BueroUebersicht() {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const supabase = await createClient();
  const [{ data: hinweise }, { data: material }, kollegen] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, text, project_id, created_at")
      .is("gelesen_am", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("material_usage")
      .select("id, material, menge, einheit, bemerkung, project_id, erstellt_von, created_at, projects(name)")
      .is("erledigt_am", null)
      .is("archiviert_am", null)
      .order("created_at", { ascending: false })
      .limit(50),
    kollegenLaden(),
  ]);
  const meldungen: OffeneMeldung[] = (material ?? []).map((m) => ({
    id: m.id,
    material: m.material,
    menge: Number(m.menge),
    einheit: m.einheit,
    bemerkung: m.bemerkung,
    projektId: m.project_id,
    projektName: m.projects?.name ?? "Baustelle",
    wer: (m.erstellt_von && kollegen.get(m.erstellt_von)?.vorname) || "Ehemaliger Kollege",
    created_at: m.created_at,
  }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-muted-foreground">{formatDatumLang(new Date())}</p>
        <p className="text-lg">Moin, {nutzer.vorname}!</p>
      </div>
      <Hinweise hinweise={hinweise ?? []} />
      <MaterialMeldungen meldungen={meldungen} />
      <Platzhalter titel="Übersicht" phase="Phase 6">
        Hier entsteht das Dashboard: zuletzt bearbeitete Projekte, offene
        Forderungen und das Wetter im Saterland.
      </Platzhalter>
    </div>
  );
}
