import "server-only";
import {
  angebotEinstellungenAusWert,
  firmaAusWert,
  type AngebotEinstellungen,
  type Firma,
} from "@/lib/firma";
import { createClient } from "@/lib/supabase/server";

/** Firmendaten aus den Einstellungen (alle eingeloggten Nutzer dürfen app_settings lesen). */
export async function firmaLaden(): Promise<Firma> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("wert").eq("schluessel", "firma").maybeSingle();
  return firmaAusWert(data?.wert);
}

export async function angebotEinstellungenLaden(): Promise<AngebotEinstellungen> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("wert").eq("schluessel", "angebote").maybeSingle();
  return angebotEinstellungenAusWert(data?.wert);
}
