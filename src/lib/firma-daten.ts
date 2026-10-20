import "server-only";
import {
  angebotEinstellungenAusWert,
  firmaAusWert,
  type AngebotEinstellungen,
  type Firma,
} from "@/lib/firma";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/** Firmendaten aus den Einstellungen (alle eingeloggten Nutzer dürfen app_settings lesen). */
export async function firmaLaden(db?: SupabaseClient<Database>): Promise<Firma> {
  const supabase = db ?? (await createClient());
  const { data } = await supabase.from("app_settings").select("wert").eq("schluessel", "firma").maybeSingle();
  return firmaAusWert(data?.wert);
}

export async function angebotEinstellungenLaden(db?: SupabaseClient<Database>): Promise<AngebotEinstellungen> {
  const supabase = db ?? (await createClient());
  const { data } = await supabase.from("app_settings").select("wert").eq("schluessel", "angebote").maybeSingle();
  return angebotEinstellungenAusWert(data?.wert);
}
