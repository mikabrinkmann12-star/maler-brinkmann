import "server-only";
import { ordnerPfadText, type KatalogArt } from "@/lib/katalog";
import { katalogSchluessel } from "@/lib/katalog-import";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";

// Abfragen für den Katalog (nur Büro/Admin, die Datenbank erzwingt es per RLS).
// Wer sie aufruft, hat vorher requireRole(BUERO_ROLLEN) geprüft.

export type OrdnerZeile = { id: string; parentId: string | null; name: string; archiviert: boolean };

/** Alle Ordner einer Art (auch archivierte, mit Kennzeichen). Es sind wenige, daher alle auf einmal. */
export async function ordnerLaden(art: KatalogArt): Promise<OrdnerZeile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_folders")
    .select("id, parent_id, name, archiviert_am")
    .eq("art", art)
    .order("name")
    .limit(5000);
  if (error) throw new Error("Die Ordner konnten nicht geladen werden.");
  return data.map((o) => ({ id: o.id, parentId: o.parent_id, name: o.name, archiviert: o.archiviert_am != null }));
}

/** Eine Zeile der Liste, für Materialien und Leistungen gleich. */
export type KatalogZeile = {
  id: string;
  folderId: string | null;
  /** Artikelnummer (Material) bzw. Nummer (Leistung) */
  nummer: string;
  name: string;
  einheit: string;
  /** Einkaufspreis (Material) bzw. Kosten (Leistung) */
  preis: number;
  zuschlag: number;
  vk: number;
  lieferant: string;
  archiviert: boolean;
};

export const MAX_ZEILEN = 300;

/**
 * Einträge laden: in einem Ordner (`ordnerId`, null = ohne Ordner), per Suche über alle Ordner (`q`)
 * oder im Archiv (`archiv`). Höchstens 300 Zeilen, `gesamt` ist die echte Anzahl.
 */
export async function eintraegeLaden(
  art: KatalogArt,
  opts: { ordnerId: string | null; q: string; archiv: boolean },
): Promise<{ zeilen: KatalogZeile[]; gesamt: number }> {
  const supabase = await createClient();
  const q = suchtext(opts.q);

  if (art === "material") {
    let abfrage = supabase
      .from("materials")
      .select("id, folder_id, artikelnr, name, einheit, ek, zuschlag_prozent, vk, lieferant, archiviert_am", { count: "exact" });
    abfrage = opts.archiv ? abfrage.not("archiviert_am", "is", null) : abfrage.is("archiviert_am", null);
    if (q) {
      abfrage = abfrage.or(["name", "artikelnr", "lieferant", "beschreibung"].map((f) => `${f}.ilike.%${q}%`).join(","));
    } else if (!opts.archiv) {
      abfrage = opts.ordnerId ? abfrage.eq("folder_id", opts.ordnerId) : abfrage.is("folder_id", null);
    }
    const { data, error, count } = await abfrage.order("name").limit(MAX_ZEILEN);
    if (error) throw new Error("Die Materialien konnten nicht geladen werden.");
    return {
      gesamt: count ?? data.length,
      zeilen: data.map((m) => ({
        id: m.id, folderId: m.folder_id, nummer: m.artikelnr ?? "", name: m.name, einheit: m.einheit,
        preis: Number(m.ek), zuschlag: Number(m.zuschlag_prozent), vk: Number(m.vk),
        lieferant: m.lieferant ?? "", archiviert: m.archiviert_am != null,
      })),
    };
  }

  let abfrage = supabase
    .from("services")
    .select("id, folder_id, nummer, name, einheit, kosten, zuschlag_prozent, vk, archiviert_am", { count: "exact" });
  abfrage = opts.archiv ? abfrage.not("archiviert_am", "is", null) : abfrage.is("archiviert_am", null);
  if (q) {
    abfrage = abfrage.or(["name", "nummer", "langtext"].map((f) => `${f}.ilike.%${q}%`).join(","));
  } else if (!opts.archiv) {
    abfrage = opts.ordnerId ? abfrage.eq("folder_id", opts.ordnerId) : abfrage.is("folder_id", null);
  }
  const { data, error, count } = await abfrage.order("name").limit(MAX_ZEILEN);
  if (error) throw new Error("Die Leistungen konnten nicht geladen werden.");
  return {
    gesamt: count ?? data.length,
    zeilen: data.map((s) => ({
      id: s.id, folderId: s.folder_id, nummer: s.nummer ?? "", name: s.name, einheit: s.einheit,
      preis: Number(s.kosten), zuschlag: Number(s.zuschlag_prozent), vk: Number(s.vk),
      lieferant: "", archiviert: s.archiviert_am != null,
    })),
  };
}

/**
 * Dubletten-Schlüssel aller vorhandenen Einträge einer Art (auch archivierter) für den Import.
 * Die Datenbank liefert höchstens 1000 Zeilen pro Abfrage, darum wird seitenweise geladen.
 */
export async function katalogSchluesselLaden(art: KatalogArt): Promise<Set<string>> {
  const supabase = await createClient();
  const ordner = await ordnerLaden(art);
  const pfad = (id: string | null) => ordnerPfadText(ordner, id).replace(/ › /g, " > ");
  const schluessel = new Set<string>();
  const SEITE = 1000;

  for (let von = 0; ; von += SEITE) {
    const seite =
      art === "material"
        ? await supabase.from("materials").select("artikelnr, lieferant, name, einheit, ek, folder_id").order("id").range(von, von + SEITE - 1)
        : await supabase.from("services").select("nummer, name, einheit, kosten, folder_id").order("id").range(von, von + SEITE - 1);
    if (seite.error) throw new Error("Die vorhandenen Einträge konnten nicht geladen werden.");
    for (const m of seite.data as Record<string, unknown>[]) {
      schluessel.add(
        katalogSchluessel({
          artikelnr: String((art === "material" ? m.artikelnr : m.nummer) ?? ""),
          lieferant: String(m.lieferant ?? ""),
          name: String(m.name),
          einheit: String(m.einheit),
          ek: Number(art === "material" ? m.ek : m.kosten),
          ordnerPfad: pfad((m.folder_id as string | null) ?? null),
        }),
      );
    }
    if (seite.data.length < SEITE) return schluessel;
  }
}
