"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { benachrichtigungenSchema, profilSchema } from "@/lib/profil";
import { createClient } from "@/lib/supabase/server";

// Eigenes Profil und Benachrichtigungen: Jeder ändert nur sich selbst, über
// zwei Datenbank-Funktionen (nur diese Felder, nur die eigene Zeile).

export type EinstellungErgebnis = { fehler?: string; ok?: boolean };

export async function profilSpeichern(_alt: EinstellungErgebnis, daten: FormData): Promise<EinstellungErgebnis> {
  await requireUser();
  const p = profilSchema.safeParse({
    vorname: daten.get("vorname"),
    nachname: daten.get("nachname"),
    telefon: daten.get("telefon"),
  });
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("eigenes_profil_speichern", {
    p_vorname: p.data.vorname,
    p_nachname: p.data.nachname,
    p_telefon: p.data.telefon,
  });
  if (error) {
    if (error.code === "P0001") return { fehler: error.message };
    return { fehler: "Das Profil konnte nicht gespeichert werden. Bitte nochmal versuchen." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function benachrichtigungenSpeichern(wahl: unknown): Promise<EinstellungErgebnis> {
  await requireUser();
  const p = benachrichtigungenSchema.safeParse(wahl);
  if (!p.success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("eigene_benachrichtigungen_speichern", { p_wert: p.data });
  if (error) return { fehler: "Das konnte nicht gespeichert werden. Bitte nochmal versuchen." };
  return { ok: true };
}
