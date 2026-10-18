import "server-only";
import { tageVerschieben } from "@/lib/datum";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";

export const PROJEKT_SPALTEN = ["name", "nummer", "status", "zeitraum", "kunde", "bearbeitet"] as const;
export type ProjektSpalte = (typeof PROJEKT_SPALTEN)[number];
export const istProjektSpalte = (w: unknown): w is ProjektSpalte => typeof w === "string" && (PROJEKT_SPALTEN as readonly string[]).includes(w);

export type ProjektTabellenZeile = {
  id: string;
  name: string;
  projektnummer: string;
  adresse: string;
  start: string | null;
  ende: string | null;
  kunde: string;
  status: { id: string; name: string; farbe: string; sortierung: number } | null;
  mitglieder: { id: string; name: string }[];
  bearbeitet: string;
  bearbeitetVon: string;
  hatDokumente: boolean;
};

/**
 * Projektliste im Stil von Plancraft. Alle Filter laufen serverseitig; die Rechte regelt die Datenbank (RLS).
 * `von`/`bis` begrenzen den Zeitpunkt der letzten Bearbeitung.
 */
export async function projekteListe(opts: {
  q?: string;
  archiv: boolean;
  statusIds?: string[];
  mitarbeiterIds?: string[];
  von?: string;
  bis?: string;
  sort?: ProjektSpalte;
  absteigend?: boolean;
}): Promise<{ zeilen: ProjektTabellenZeile[]; gesamt: number }> {
  const supabase = await createClient();
  const q = suchtext(opts.q ?? "");

  let erlaubteIds: string[] | null = null;
  if (opts.mitarbeiterIds?.length) {
    const { data } = await supabase.from("project_members").select("project_id").in("user_id", opts.mitarbeiterIds).limit(5000);
    erlaubteIds = [...new Set((data ?? []).map((m) => m.project_id))];
    if (!erlaubteIds.length) return { zeilen: [], gesamt: 0 };
  }

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
      "id, name, projektnummer, baustelle_strasse, baustelle_plz, baustelle_ort, start_datum, end_datum, updated_at, bearbeitet_von, project_statuses(id, name, farbe, sortierung), contacts(firmenname, vorname, nachname)",
    );
  abfrage = opts.archiv ? abfrage.not("archiviert_am", "is", null) : abfrage.is("archiviert_am", null);
  if (opts.statusIds?.length) abfrage = abfrage.in("status_id", opts.statusIds);
  if (erlaubteIds) abfrage = abfrage.in("id", erlaubteIds);
  if (opts.von) abfrage = abfrage.gte("updated_at", `${opts.von}T00:00:00`);
  if (opts.bis) abfrage = abfrage.lt("updated_at", `${tageVerschieben(opts.bis, 1)}T00:00:00`);
  if (q) {
    const felder = ["name", "projektnummer", "baustelle_strasse", "baustelle_plz", "baustelle_ort"].map((f) => `${f}.ilike.%${q}%`);
    if (kundenIds.length) felder.push(`contact_id.in.(${kundenIds.join(",")})`);
    abfrage = abfrage.or(felder.join(","));
  }
  const { data, error } = await abfrage.order("updated_at", { ascending: false }).limit(1000);
  if (error) throw new Error("Die Projekte konnten nicht geladen werden.");

  const ids = data.map((p) => p.id);
  const [mitgliederDaten, dokumenteDaten, kollegen] = await Promise.all([
    ids.length ? supabase.from("project_members").select("project_id, user_id").in("project_id", ids).limit(10000) : { data: [] },
    ids.length ? supabase.from("project_files").select("project_id").in("project_id", ids).is("archiviert_am", null).limit(10000) : { data: [] },
    kollegenLaden(),
  ]);
  const name = (uid: string) => {
    const k = kollegen.get(uid);
    return k ? `${k.vorname} ${k.nachname}`.trim() : "Ehemaliger Kollege";
  };
  const mitglieder = new Map<string, { id: string; name: string }[]>();
  for (const m of mitgliederDaten.data ?? []) {
    const liste = mitglieder.get(m.project_id) ?? [];
    liste.push({ id: m.user_id, name: name(m.user_id) });
    mitglieder.set(m.project_id, liste);
  }
  const mitDokumenten = new Set((dokumenteDaten.data ?? []).map((d) => d.project_id));

  const zeilen: ProjektTabellenZeile[] = data.map((p) => ({
    id: p.id,
    name: p.name,
    projektnummer: p.projektnummer,
    adresse: [p.baustelle_strasse, [p.baustelle_plz, p.baustelle_ort].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    start: p.start_datum,
    ende: p.end_datum,
    kunde: p.contacts?.firmenname || [p.contacts?.vorname, p.contacts?.nachname].filter(Boolean).join(" ") || "",
    status: p.project_statuses,
    mitglieder: (mitglieder.get(p.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, "de")),
    bearbeitet: p.updated_at,
    bearbeitetVon: p.bearbeitet_von ? name(p.bearbeitet_von) : "",
    hatDokumente: mitDokumenten.has(p.id),
  }));

  const sort = opts.sort ?? "bearbeitet";
  const richtung = (opts.absteigend ?? sort === "bearbeitet") ? -1 : 1;
  const text = (a: string, b: string) => a.localeCompare(b, "de", { numeric: true, sensitivity: "base" });
  const schluessel: Record<ProjektSpalte, (a: ProjektTabellenZeile, b: ProjektTabellenZeile) => number> = {
    name: (a, b) => text(a.name, b.name),
    nummer: (a, b) => (a.projektnummer ? (b.projektnummer ? text(a.projektnummer, b.projektnummer) : -1) : b.projektnummer ? 1 : 0),
    status: (a, b) => (a.status?.sortierung ?? 999) - (b.status?.sortierung ?? 999),
    zeitraum: (a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999"),
    kunde: (a, b) => (a.kunde ? (b.kunde ? text(a.kunde, b.kunde) : -1) : b.kunde ? 1 : 0),
    bearbeitet: (a, b) => a.bearbeitet.localeCompare(b.bearbeitet),
  };
  zeilen.sort((a, b) => richtung * schluessel[sort](a, b));
  return { zeilen, gesamt: zeilen.length };
}
