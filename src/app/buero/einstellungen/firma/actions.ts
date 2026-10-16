"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { FIRMA_LEER, firmaSchema } from "@/lib/firma";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { createClient } from "@/lib/supabase/server";

export type FirmaZustand = { fehler?: string; gespeichert?: number };

/** Firmendaten speichern (nur Admin). Sie erscheinen auf Angeboten (Briefkopf und Fußzeile). */
export async function firmaSpeichern(_vorher: FirmaZustand, formData: FormData): Promise<FirmaZustand> {
  const admin = await requireRole(["admin"]);
  const roh: Record<string, string> = {};
  for (const k of Object.keys(FIRMA_LEER)) roh[k] = String(formData.get(k) ?? "");
  const pruefung = firmaSchema.safeParse(roh);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({ schluessel: "firma", wert: pruefung.data, updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  revalidatePath("/buero/einstellungen/firma");
  revalidatePath("/buero/angebote", "layout");
  return { gespeichert: Date.now() };
}
