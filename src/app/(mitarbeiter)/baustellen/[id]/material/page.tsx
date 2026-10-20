import type { Metadata } from "next";
import { formatDatum, formatDatumZeit } from "@/lib/format";
import { projektKontext } from "@/lib/projekt-kontext";
import { Warteschlange } from "../../../warteschlange";
import { Material, type MaterialAnzeige } from "../material";

export const metadata: Metadata = { title: "Material" };

// Reiter „Material“: Material melden (Büro hakt ab).
export default async function MaterialSeite({ params }: PageProps<"/baustellen/[id]/material">) {
  const { id } = await params;
  const k = await projektKontext(id);
  const { data } = await k.supabase
    .from("material_usage")
    .select("id, material, menge, einheit, bemerkung, erledigt_am, erstellt_von, created_at")
    .eq("project_id", id)
    .is("archiviert_am", null)
    .order("created_at", { ascending: false });

  const eintraege: MaterialAnzeige[] = (data ?? []).map((m) => ({
    id: m.id,
    material: m.material,
    menge: Number(m.menge),
    einheit: m.einheit,
    bemerkung: m.bemerkung ?? "",
    wer: k.wer(m.erstellt_von),
    wann: formatDatumZeit(m.created_at),
    erledigt: m.erledigt_am ? formatDatum(m.erledigt_am) : null,
    darfLoeschen: k.darfLoeschen(m.erstellt_von),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Warteschlange userId={k.nutzer.id} />
      <Material projektId={id} ichId={k.nutzer.id} darfMelden={k.darfInhalte} darfAbhaken={k.istBuero} eintraege={eintraege} />
    </div>
  );
}
