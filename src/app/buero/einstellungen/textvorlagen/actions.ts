"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { vorlageSchema } from "@/lib/textvorlagen";
import { createClient } from "@/lib/supabase/server";

export type VorlageErgebnis = { fehler?: string; id?: string };

const uuid = z.uuid();

function dbMeldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "23505") return "Eine Vorlage mit diesem Namen gibt es für diese Art schon.";
  if (fehler.code === "23514") return "Ein Wert ist ungültig (zu lang oder leer).";
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

function aktualisieren() {
  revalidatePath("/buero/einstellungen/textvorlagen");
  revalidatePath("/buero/angebote", "layout");
}

/** Vorlage anlegen (id leer) oder ändern (nur Admin). Ist „Standard“ gesetzt, verliert die bisherige Standard-Vorlage dieser Art den Status. */
export async function vorlageSpeichern(id: string | null, eingabe: unknown): Promise<VorlageErgebnis> {
  await requireRole(["admin"]);
  if (id !== null && !uuid.safeParse(id).success) return { fehler: "Ungültige Vorlage." };
  const pruefung = vorlageSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const v = pruefung.data;
  const supabase = await createClient();

  if (v.standard) {
    // Erst die bisherige Standard-Vorlage dieser Art abwählen (es darf nur eine geben)
    let abfrage = supabase.from("text_templates").update({ standard: false }).eq("art", v.art).eq("standard", true).is("archiviert_am", null);
    if (id) abfrage = abfrage.neq("id", id);
    const { error } = await abfrage;
    if (error) return { fehler: dbMeldung(error) };
  }

  const felder = { name: v.name, inhalt: v.inhalt, standard: v.standard };
  const abfrage = id
    ? supabase.from("text_templates").update(felder).eq("id", id).eq("art", v.art)
    : supabase.from("text_templates").insert({ ...felder, art: v.art });
  const { data, error } = await abfrage.select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Vorlage nicht gefunden." };
  aktualisieren();
  return { id: data[0].id };
}

/** Vorlage archivieren (nur Admin). Nichts wird gelöscht; bestehende Angebote behalten ihren Text. */
export async function vorlageArchivieren(id: string): Promise<VorlageErgebnis> {
  await requireRole(["admin"]);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Vorlage." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("text_templates")
    .update({ archiviert_am: new Date().toISOString(), standard: false })
    .eq("id", id)
    .select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Vorlage nicht gefunden." };
  aktualisieren();
  return { id };
}
