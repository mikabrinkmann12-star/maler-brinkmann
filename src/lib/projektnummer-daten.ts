import "server-only";
import { heuteIso } from "@/lib/datum";
import { naechsteProjektnummer } from "@/lib/projektnummer";
import { createClient } from "@/lib/supabase/server";

/** Startwert aus den Einstellungen („Nummernkreise“): höchste in Plancraft vergebene laufende Nummer. */
export async function projektnummerStart(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("wert").eq("schluessel", "nummernkreise").maybeSingle();
  const wert = (data?.wert as { projekt_start?: unknown } | null)?.projekt_start;
  return typeof wert === "number" && Number.isInteger(wert) && wert >= 0 ? wert : 0;
}

/** Nächste freie Projektnummer (berücksichtigt auch archivierte Projekte). */
export async function projektnummerVorschlag(): Promise<string> {
  const supabase = await createClient();
  const nummern: string[] = [];
  for (let von = 0; von < 20_000; von += 1000) {
    const { data, error } = await supabase.from("projects").select("projektnummer").order("id").range(von, von + 999);
    if (error) throw new Error("Die Projektnummern konnten nicht gelesen werden.");
    nummern.push(...data.map((p) => p.projektnummer));
    if (data.length < 1000) break;
  }
  return naechsteProjektnummer(nummern, await projektnummerStart(), Number(heuteIso().slice(0, 4)));
}
