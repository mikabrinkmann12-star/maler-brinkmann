"use server";

import { revalidatePath } from "next/cache";
import { requireBueroRecht } from "@/lib/auth";
import { einheitenPruefen } from "@/lib/einheiten";
import { createClient } from "@/lib/supabase/server";

export type EinheitenErgebnis = { fehler?: string };

/** Einheiten und Vorauswahl speichern (nur Admin). */
export async function einheitenSpeichern(eingabe: unknown): Promise<EinheitenErgebnis> {
  const admin = await requireBueroRecht("einstellungen_firma");
  const e = eingabe as { liste?: unknown; position?: unknown; material?: unknown } | null;
  if (!e || !Array.isArray(e.liste) || e.liste.some((x) => typeof x !== "string") || typeof e.position !== "string" || typeof e.material !== "string") {
    return { fehler: "Ungültige Eingabe." };
  }
  const pruefung = einheitenPruefen({ liste: e.liste as string[], position: e.position, material: e.material });
  if ("fehler" in pruefung) return { fehler: pruefung.fehler };

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({ schluessel: "einheiten", wert: pruefung.wert, updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  revalidatePath("/buero", "layout");
  return {};
}
