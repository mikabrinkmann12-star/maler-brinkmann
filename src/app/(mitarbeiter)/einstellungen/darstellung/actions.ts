"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireBueroRecht, requireUser } from "@/lib/auth";
import { AKZENT_COOKIE, darstellungPruefen, type Akzent } from "@/lib/darstellung";
import { darstellungLaden } from "@/lib/darstellung-daten";
import { createClient } from "@/lib/supabase/server";

// „Darstellung“: Farbsatz und Büro-Seitenleiste je Nutzer, dazu die Vorgabe der Firma. Reine Optik, keine Rechte.

async function akzentMerken(akzent: Akzent) {
  (await cookies()).set(AKZENT_COOKIE, akzent, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/** Eigene Darstellung speichern (jeder Nutzer nur seine eigene; RLS setzt das zusätzlich durch). null-Felder = Vorgabe der Firma. */
export async function darstellungSpeichern(eingabe: unknown): Promise<{ fehler?: string }> {
  const nutzer = await requireUser();
  const d = darstellungPruefen(eingabe);
  const supabase = await createClient();
  const { error } = await supabase.from("nutzer_darstellung").upsert({ nutzer_id: nutzer.id, akzent: d.akzent, reihenfolge: d.reihenfolge, ausgeblendet: d.ausgeblendet });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  await akzentMerken((await darstellungLaden()).wirksam.akzent);
  return {};
}

/** Eigene Darstellung auf die Vorgabe der Firma zurücksetzen. */
export async function darstellungZuruecksetzen(): Promise<{ fehler?: string }> {
  const nutzer = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("nutzer_darstellung").upsert({ nutzer_id: nutzer.id, akzent: null, reihenfolge: null, ausgeblendet: null });
  if (error) return { fehler: "Zurücksetzen hat nicht geklappt. Bitte nochmal versuchen." };
  await akzentMerken((await darstellungLaden()).wirksam.akzent);
  return {};
}

/** Vorgabe für alle (Admin bzw. Recht „Firmeneinstellungen“): gilt für jeden, der nichts Eigenes eingestellt hat. */
export async function vorgabeSpeichern(eingabe: unknown): Promise<{ fehler?: string }> {
  const admin = await requireBueroRecht("einstellungen_firma");
  const d = darstellungPruefen(eingabe);
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({ schluessel: "darstellung", wert: d, updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  await akzentMerken((await darstellungLaden()).wirksam.akzent);
  return {};
}
