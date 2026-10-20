"use server";

import { revalidatePath } from "next/cache";
import { requireBueroRecht } from "@/lib/auth";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { einstellungenAusEingabe, rechnungsEinstellungenAlsJson, rechnungsEinstellungenSchema } from "@/lib/rechnung-einstellungen";
import { createClient } from "@/lib/supabase/server";

export type RechnungsEinstellungenErgebnis = { fehler?: string };

/** „Rechnungen – Vorgaben“ speichern, nur Admin (RLS prüft es zusätzlich). */
export async function rechnungsEinstellungenSpeichern(eingabe: unknown): Promise<RechnungsEinstellungenErgebnis> {
  const admin = await requireBueroRecht("einstellungen_firma");
  const pruefung = rechnungsEinstellungenSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ schluessel: "rechnungen", wert: rechnungsEinstellungenAlsJson(einstellungenAusEingabe(pruefung.data)), updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  revalidatePath("/buero/einstellungen/rechnungen");
  return {};
}
