import "server-only";
import { STANDARD_EINSTELLUNGEN, einstellungenAusJson, type KalkulationEinstellungen } from "@/lib/kalkulation";
import { createClient } from "@/lib/supabase/server";

// Einstellungen der Kalkulation (Zuschläge, Lohngruppen). Nur Büro und Admin dürfen sie lesen (RLS), nur der Admin ändert sie.
// Wer sie aufruft, hat vorher requireRole(BUERO_ROLLEN) geprüft.

export async function kalkulationLaden(): Promise<KalkulationEinstellungen> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("kalkulation_einstellungen").select("zuschlaege, lohngruppen").maybeSingle();
  if (error) throw new Error("Die Kalkulation konnte nicht geladen werden.");
  return data ? einstellungenAusJson(data.zuschlaege, data.lohngruppen) : STANDARD_EINSTELLUNGEN;
}
