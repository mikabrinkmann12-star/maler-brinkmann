"use server";

import { revalidatePath } from "next/cache";
import { requireBueroRecht } from "@/lib/auth";
import type { Benachrichtigung } from "@/lib/benachrichtigung";
import { benachrichtigungenLaden, ungelesenZaehler } from "@/lib/benachrichtigung-daten";
import { createClient } from "@/lib/supabase/server";

/** Für das Benachrichtigungen-Fenster: alle Einträge und die Zahl der ungelesenen. */
export async function benachrichtigungenHolen(): Promise<{ liste: Benachrichtigung[]; ungelesen: number }> {
  await requireBueroRecht("buero_zugang");
  const liste = await benachrichtigungenLaden();
  return { liste, ungelesen: liste.filter((b) => !b.gelesen).length };
}

/** Nur die Zahl für die Glocke (wird regelmäßig abgefragt). */
export async function benachrichtigungenZahl(): Promise<number> {
  await requireBueroRecht("buero_zugang");
  return ungelesenZaehler();
}

/** Einen Hinweis (oder alle, wenn id fehlt) als gelesen markieren. */
export async function hinweiseGelesen(id?: number): Promise<void> {
  await requireBueroRecht("buero_zugang");
  const supabase = await createClient();
  let abfrage = supabase.from("notifications").update({ gelesen_am: new Date().toISOString() }).is("gelesen_am", null);
  if (typeof id === "number") abfrage = abfrage.eq("id", id);
  await abfrage;
  revalidatePath("/buero");
}
