"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { laufendeNummer } from "@/lib/projektnummer";
import { createClient } from "@/lib/supabase/server";

export type NummernkreisZustand = { fehler?: string; gespeichert?: number };

/** Startwert der Projektnummern speichern (nur Admin). Eingabe: „512“ oder „P-(2600)512“. */
export async function nummernkreisSpeichern(_vorher: NummernkreisZustand, formData: FormData): Promise<NummernkreisZustand> {
  const admin = await requireRole(["admin"]);
  const roh = String(formData.get("projekt_start") ?? "").trim();
  const nummer = roh === "" ? 0 : laufendeNummer(roh);
  if (nummer === null) return { fehler: "Bitte die Nummer eingeben, z. B. 512 oder P-(2600)512." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ schluessel: "nummernkreise", wert: { projekt_start: nummer }, updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  revalidatePath("/buero/einstellungen/nummernkreise");
  revalidatePath("/buero/projekte", "layout");
  return { gespeichert: Date.now() };
}
