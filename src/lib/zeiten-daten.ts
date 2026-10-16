import "server-only";
import { createClient } from "@/lib/supabase/server";
import { einstellungenLesen, type ZeiterfassungEinstellungen } from "@/lib/zeiten";

/** Einstellungen „Zeiterfassung“ aus app_settings (alle aktiven Nutzer dürfen lesen). */
export async function zeiterfassungEinstellungen(): Promise<ZeiterfassungEinstellungen> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("wert")
    .eq("schluessel", "zeiterfassung")
    .maybeSingle();
  return einstellungenLesen(data?.wert);
}
