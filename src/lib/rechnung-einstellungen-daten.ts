import "server-only";
import { rechnungsEinstellungenAusJson, type RechnungsEinstellungen } from "@/lib/rechnung-einstellungen";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/** Einstellungen „Rechnungen – Vorgaben“ (alle eingeloggten Nutzer dürfen app_settings lesen; ändern darf nur der Admin). */
export async function rechnungsEinstellungenLaden(db?: SupabaseClient<Database>): Promise<RechnungsEinstellungen> {
  const supabase = db ?? (await createClient());
  const { data } = await supabase.from("app_settings").select("wert").eq("schluessel", "rechnungen").maybeSingle();
  return rechnungsEinstellungenAusJson(data?.wert);
}
