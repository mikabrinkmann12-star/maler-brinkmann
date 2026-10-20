"use server";

import { revalidatePath } from "next/cache";
import { requireBueroRecht } from "@/lib/auth";
import { FIRMA_LEER, LOGO_PFAD, firmaSchema } from "@/lib/firma";
import { firmaLaden } from "@/lib/firma-daten";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { createClient } from "@/lib/supabase/server";

export type FirmaZustand = { fehler?: string; gespeichert?: number };

function aktualisieren() {
  revalidatePath("/buero/einstellungen/firma");
  revalidatePath("/buero/angebote", "layout");
}

/** Firmendaten speichern (nur Admin). Sie erscheinen auf Angeboten (Briefkopf und Fußzeile). Das Logo bleibt unverändert. */
export async function firmaSpeichern(_vorher: FirmaZustand, formData: FormData): Promise<FirmaZustand> {
  const admin = await requireBueroRecht("einstellungen_firma");
  const aktuell = await firmaLaden();
  const roh: Record<string, string> = {};
  for (const k of Object.keys(FIRMA_LEER)) roh[k] = k === "logo" ? aktuell.logo : String(formData.get(k) ?? "");
  const pruefung = firmaSchema.safeParse(roh);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({ schluessel: "firma", wert: pruefung.data, updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  aktualisieren();
  return { gespeichert: Date.now() };
}

/** Nach dem Hochladen (aus dem Browser in den Bucket „firmenlogo“) das Logo in den Firmendaten festlegen. */
export async function logoSetzen(pfad: string): Promise<{ fehler?: string }> {
  const admin = await requireBueroRecht("einstellungen_firma");
  if (!LOGO_PFAD.test(pfad)) return { fehler: "Ungültiger Dateiname." };
  const supabase = await createClient();
  const { data: dateien } = await supabase.storage.from("firmenlogo").list("", { search: pfad, limit: 5 });
  if (!dateien?.some((d) => d.name === pfad)) return { fehler: "Das Logo ist nicht angekommen. Bitte nochmal hochladen." };

  const alt = await firmaLaden();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ schluessel: "firma", wert: { ...alt, logo: pfad }, updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  if (alt.logo && alt.logo !== pfad) await supabase.storage.from("firmenlogo").remove([alt.logo]);
  aktualisieren();
  return {};
}

export async function logoEntfernen(): Promise<{ fehler?: string }> {
  const admin = await requireBueroRecht("einstellungen_firma");
  const supabase = await createClient();
  const alt = await firmaLaden();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ schluessel: "firma", wert: { ...alt, logo: "" }, updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  if (alt.logo) await supabase.storage.from("firmenlogo").remove([alt.logo]);
  aktualisieren();
  return {};
}
