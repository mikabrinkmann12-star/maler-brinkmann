import "server-only";
import { einheitenAusJson, type EinheitenEinstellungen } from "@/lib/einheiten";
import { createClient } from "@/lib/supabase/server";

/** Einheiten aus den Einstellungen (alle aktiven Nutzer dürfen app_settings lesen). */
export async function einheitenLaden(): Promise<EinheitenEinstellungen> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("wert").eq("schluessel", "einheiten").maybeSingle();
  return einheitenAusJson(data?.wert);
}
