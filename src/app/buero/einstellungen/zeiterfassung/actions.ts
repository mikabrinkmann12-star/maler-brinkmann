"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { createClient } from "@/lib/supabase/server";
import { einstellungenSchema } from "@/lib/zeit-schema";
import { einstellungenAlsJson } from "@/lib/zeiten";

export type EinstellungenZustand = { fehler?: string; gespeichert?: number };

/** Einstellungen „Zeiterfassung“ speichern – nur Admin (RLS prüft es zusätzlich). */
export async function einstellungenSpeichern(
  _vorher: EinstellungenZustand,
  formData: FormData,
): Promise<EinstellungenZustand> {
  const admin = await requireRole(["admin"]);

  const pruefung = einstellungenSchema.safeParse({
    erlaubteArten: formData.getAll("erlaubte_arten"),
    standardBeginn: formData.get("standard_beginn"),
    standardEnde: formData.get("standard_ende"),
    standardPauseMin: formData.get("standard_pause_min"),
    kulanzTage: formData.get("kulanz_tage"),
  });
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ schluessel: "zeiterfassung", wert: einstellungenAlsJson(pruefung.data), updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };

  revalidatePath("/buero/einstellungen/zeiterfassung");
  revalidatePath("/zeiten", "layout");
  return { gespeichert: Date.now() };
}
