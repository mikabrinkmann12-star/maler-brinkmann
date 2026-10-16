import "server-only";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";

export type ProjektZeile = {
  id: string;
  projektnummer: string;
  name: string;
  baustelle_strasse: string | null;
  baustelle_plz: string | null;
  baustelle_ort: string | null;
  start_datum: string | null;
  end_datum: string | null;
  archiviert_am: string | null;
  created_at: string;
  updated_at: string;
  status: { name: string; farbe: string } | null;
  kunde: string;
};

export type ProjektSortierung = "neu" | "alt" | "name_auf" | "name_ab" | "geaendert";

export function istProjektSortierung(w: unknown): w is ProjektSortierung {
  return typeof w === "string" && ["neu", "alt", "name_auf", "name_ab", "geaendert"].includes(w);
}

/**
 * Projekte suchen (Name, Projektnummer, Straße, PLZ, Ort, Kundenname). Die Rechte regelt die Datenbank:
 * Mitarbeiter bekommen nur eigene und archivierte Projekte, Büro/Admin alle.
 */
export async function projekteSuchen(opts: {
  q?: string;
  archiv: boolean;
  statusId?: string;
  sortierung?: ProjektSortierung;
  limit?: number;
}): Promise<{ projekte: ProjektZeile[]; gesamt: number }> {
  const supabase = await createClient();
  const q = suchtext(opts.q ?? "");

  let kundenIds: string[] = [];
  if (q) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .or(["firmenname", "vorname", "nachname", "kundennummer"].map((f) => `${f}.ilike.%${q}%`).join(","))
      .limit(200);
    kundenIds = (data ?? []).map((k) => k.id);
  }

  let abfrage = supabase
    .from("projects")
    .select(
      "id, projektnummer, name, baustelle_strasse, baustelle_plz, baustelle_ort, start_datum, end_datum, archiviert_am, created_at, updated_at, project_statuses(name, farbe), contacts(firmenname, vorname, nachname)",
      { count: "exact" },
    );
  abfrage = opts.archiv ? abfrage.not("archiviert_am", "is", null) : abfrage.is("archiviert_am", null);
  if (opts.statusId) abfrage = abfrage.eq("status_id", opts.statusId);
  if (q) {
    const felder = ["name", "projektnummer", "baustelle_strasse", "baustelle_plz", "baustelle_ort"].map((f) => `${f}.ilike.%${q}%`);
    if (kundenIds.length) felder.push(`contact_id.in.(${kundenIds.join(",")})`);
    abfrage = abfrage.or(felder.join(","));
  }
  const sortierung = opts.sortierung ?? "neu";
  abfrage =
    sortierung === "alt" ? abfrage.order("created_at", { ascending: true })
    : sortierung === "name_auf" ? abfrage.order("name", { ascending: true })
    : sortierung === "name_ab" ? abfrage.order("name", { ascending: false })
    : sortierung === "geaendert" ? abfrage.order("updated_at", { ascending: false })
    : abfrage.order("created_at", { ascending: false });

  const { data, count, error } = await abfrage.limit(opts.limit ?? 200);
  if (error) throw new Error("Die Projekte konnten nicht geladen werden.");
  return {
    gesamt: count ?? data.length,
    projekte: data.map((p) => ({
      id: p.id,
      projektnummer: p.projektnummer,
      name: p.name,
      baustelle_strasse: p.baustelle_strasse,
      baustelle_plz: p.baustelle_plz,
      baustelle_ort: p.baustelle_ort,
      start_datum: p.start_datum,
      end_datum: p.end_datum,
      archiviert_am: p.archiviert_am,
      created_at: p.created_at,
      updated_at: p.updated_at,
      status: p.project_statuses,
      kunde: p.contacts?.firmenname || [p.contacts?.vorname, p.contacts?.nachname].filter(Boolean).join(" ") || "",
    })),
  };
}
