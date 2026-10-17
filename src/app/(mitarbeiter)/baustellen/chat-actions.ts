"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { nachrichtSchema } from "@/lib/chat";
import { createClient } from "@/lib/supabase/server";

// Projekt-Chat. Verbindlich regelt die Datenbank (RLS): Büro/Admin und Mitglieder lesen und schreiben, nur in aktiven Projekten,
// Anhänge müssen zum selben Projekt gehören, gesendete Nachrichten ändern sich nie (nur eigene entfernen = archivieren).

export type ChatErgebnis = { fehler?: string };

/** Nachricht senden. Die ID erzeugt die App: erneutes Senden derselben Nachricht speichert nichts doppelt. */
export async function nachrichtSenden(eingabe: unknown): Promise<ChatErgebnis> {
  const nutzer = await requireUser();
  const pruefung = nachrichtSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const n = pruefung.data;

  const supabase = await createClient();
  const { error } = await supabase.from("project_messages").insert({
    id: n.id,
    project_id: n.projektId,
    text: n.text,
    foto_id: n.fotoId ?? null,
    datei_id: n.dateiId ?? null,
    erstellt_von: nutzer.id,
  });
  if (error && error.code !== "23505") {
    return { fehler: "Das hat nicht geklappt. Schreiben geht nur auf aktiven Baustellen, auf denen du eingetragen bist." };
  }
  return {};
}

/** Eigene Nachricht entfernen (archivieren), das Büro darf jede. */
export async function nachrichtEntfernen(id: string, projektId: string): Promise<ChatErgebnis> {
  await requireUser();
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(projektId).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_messages")
    .update({ archiviert_am: new Date().toISOString() })
    .eq("id", id)
    .eq("project_id", projektId)
    .select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt. Du kannst nur eigene Nachrichten entfernen." };
  return {};
}

/** Chat als gelesen markieren (setzt der Datenbank-Zeitpunkt; der Zähler auf der Kachel geht auf 0). */
export async function chatGelesen(projektId: string): Promise<ChatErgebnis> {
  await requireUser();
  if (!z.uuid().safeParse(projektId).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("chat_gelesen_markieren", { p_projekt: projektId });
  return error ? { fehler: "Konnte nicht als gelesen markiert werden." } : {};
}
