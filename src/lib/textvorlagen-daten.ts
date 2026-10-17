import "server-only";
import type { Textvorlage } from "@/lib/textvorlagen";
import { createClient } from "@/lib/supabase/server";

/** Alle aktiven Textvorlagen (Büro und Admin dürfen sie lesen). */
export async function textvorlagenLaden(): Promise<Textvorlage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("text_templates")
    .select("id, art, name, inhalt, standard")
    .is("archiviert_am", null)
    .order("name")
    .limit(500);
  if (error) throw new Error("Die Textvorlagen konnten nicht geladen werden.");
  return data.map((v) => ({ id: v.id, art: v.art, name: v.name, inhalt: v.inhalt, standard: v.standard }));
}
