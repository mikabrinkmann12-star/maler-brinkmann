"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { angebotEinstellungenSchema } from "@/lib/firma";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { zahlLesen } from "@/lib/angebot";
import { createClient } from "@/lib/supabase/server";

export type AngebotEinstellungenZustand = { fehler?: string; gespeichert?: number };

/** Standardtexte und -werte für neue Angebote speichern (nur Admin). Bestehende Angebote ändern sich nicht. */
export async function angebotEinstellungenSpeichern(
  _vorher: AngebotEinstellungenZustand,
  formData: FormData,
): Promise<AngebotEinstellungenZustand> {
  const admin = await requireRole(["admin"]);
  const rabatt = zahlLesen(String(formData.get("standard_rabatt") ?? "0") || "0", 2);
  const pruefung = angebotEinstellungenSchema.safeParse({
    einleitung: String(formData.get("einleitung") ?? ""),
    schlusstext: String(formData.get("schlusstext") ?? ""),
    reverse_charge_text: String(formData.get("reverse_charge_text") ?? ""),
    standard_steuersatz: Number(formData.get("standard_steuersatz")),
    standard_rabatt: rabatt ?? Number.NaN,
  });
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({ schluessel: "angebote", wert: pruefung.data, updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  revalidatePath("/buero/einstellungen/angebote");
  return { gespeichert: Date.now() };
}
