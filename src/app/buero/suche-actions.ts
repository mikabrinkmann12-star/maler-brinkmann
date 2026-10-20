"use server";

import { requireBueroRecht } from "@/lib/auth";
import { kontaktName } from "@/lib/projekt";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";

export type SuchTreffer = {
  art: "projekt" | "kontakt" | "dokument";
  id: string;
  titel: string;
  /** Zweite Zeile, z. B. Projektnummer · Kunde */
  zeile: string;
  href: string;
  archiviert?: boolean;
};

const PRO_ART = 8;

/**
 * Globale Suche (Strg+K) im Büro: Projekte, Kontakte und Dokumente (Dateien in den Projekten).
 * Mehrere Wörter müssen alle vorkommen (Reihenfolge egal). Gesucht wird mit den Rechten des eingeloggten Nutzers.
 */
export async function suchen(eingabe: string): Promise<SuchTreffer[]> {
  await requireBueroRecht("buero_zugang");
  const woerter = suchtext(String(eingabe ?? "")).split(" ").filter((w) => w.length > 0).slice(0, 4);
  if (woerter.length === 0) return [];
  const supabase = await createClient();

  const projektAbfrage = woerter.reduce(
    (a, w) => a.or(["name", "projektnummer", "baustelle_strasse", "baustelle_ort"].map((f) => `${f}.ilike.%${w}%`).join(",")),
    supabase.from("projects").select("id, name, projektnummer, baustelle_strasse, baustelle_ort, archiviert_am, contacts(firmenname, vorname, nachname)"),
  );
  const kontaktAbfrage = woerter.reduce(
    (a, w) => a.or(["firmenname", "vorname", "nachname", "kundennummer", "strasse", "ort", "telefon", "mobil", "email"].map((f) => `${f}.ilike.%${w}%`).join(",")),
    supabase.from("contacts").select("id, kundennummer, firmenname, vorname, nachname, strasse, plz, ort, archiviert_am"),
  );
  const dateiAbfrage = woerter.reduce(
    (a, w) => a.ilike("dateiname", `%${w}%`),
    supabase.from("project_files").select("id, dateiname, project_id, projects(name, projektnummer)").is("archiviert_am", null),
  );

  const [projekte, kontakte, dateien] = await Promise.all([
    projektAbfrage.order("updated_at", { ascending: false }).limit(PRO_ART),
    kontaktAbfrage.order("updated_at", { ascending: false }).limit(PRO_ART),
    dateiAbfrage.order("created_at", { ascending: false }).limit(PRO_ART),
  ]);
  if (projekte.error || kontakte.error || dateien.error) throw new Error("Die Suche hat nicht geklappt.");

  return [
    ...projekte.data.map((p): SuchTreffer => ({
      art: "projekt",
      id: p.id,
      titel: p.name,
      zeile: [p.projektnummer, kontaktName(p.contacts), p.baustelle_ort].filter(Boolean).join(" · "),
      href: `/buero/projekte/${p.id}`,
      archiviert: p.archiviert_am != null,
    })),
    ...kontakte.data.map((k): SuchTreffer => ({
      art: "kontakt",
      id: k.id,
      titel: kontaktName(k),
      zeile: [k.kundennummer, [k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
      href: `/buero/kontakte/${k.id}`,
      archiviert: k.archiviert_am != null,
    })),
    ...dateien.data.map((d): SuchTreffer => ({
      art: "dokument",
      id: d.id,
      titel: d.dateiname,
      zeile: [d.projects?.projektnummer, d.projects?.name].filter(Boolean).join(" · "),
      href: `/buero/projekte/${d.project_id}`,
    })),
  ];
}
