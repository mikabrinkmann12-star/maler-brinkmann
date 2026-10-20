"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { dateiPfad, dateiPruefen } from "@/lib/dateien";
import { createClient } from "@/lib/supabase/server";

// Dateien in der Ablage eines Projekts. Verbindlich regelt die Datenbank (RLS): Büro/Admin und Mitglieder des Projekts laden hoch,
// eigene Dateien archivieren; archivierte Projekte bleiben für alle lesbar.

export type DateiErgebnis = { fehler?: string };

const dateiSchema = z.object({
  id: z.uuid(),
  projektId: z.uuid(),
  dateiname: z.string().trim().min(1, "Der Dateiname fehlt.").max(200, "Der Dateiname ist zu lang (höchstens 200 Zeichen)."),
  groesseBytes: z.number().int().positive(),
});

/** Datei-Eintrag anlegen, NACHDEM die Datei im Speicher liegt (Upload direkt aus dem Browser). Mehrfaches Senden ist unschädlich. */
export async function dateiSpeichern(eingabe: unknown): Promise<DateiErgebnis> {
  const nutzer = await requireUser();
  const pruefung = dateiSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const d = pruefung.data;
  const art = dateiPruefen(d.dateiname, d.groesseBytes);
  if (!art.ok) return { fehler: art.fehler };
  const pfad = dateiPfad(d.projektId, d.id, art.endung);

  const supabase = await createClient();
  const { data: dateien } = await supabase.storage.from("projektdateien").list(d.projektId, { search: `${d.id}.${art.endung}` });
  if (!dateien?.some((f) => f.name === `${d.id}.${art.endung}`)) return { fehler: "Die Datei ist nicht angekommen. Bitte nochmal hochladen." };

  const { error } = await supabase.from("project_files").insert({
    id: d.id,
    project_id: d.projektId,
    storage_pfad: pfad,
    dateiname: d.dateiname,
    mime: art.typ,
    groesse_bytes: d.groesseBytes,
    erstellt_von: nutzer.id,
  });
  if (error && error.code !== "23505") return { fehler: "Dateien gehen nur auf Baustellen, auf denen du eingetragen bist." };
  revalidatePath(`/baustellen/${d.projektId}`, "layout");
  return {};
}

/** Datei aus der Ablage nehmen (archivieren): eigene Dateien, das Büro alle. Die Datei selbst bleibt im Speicher. */
export async function dateiArchivieren(id: string, projektId: string): Promise<DateiErgebnis> {
  await requireUser();
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(projektId).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_files")
    .update({ archiviert_am: new Date().toISOString() })
    .eq("id", id)
    .eq("project_id", projektId)
    .select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt. Du kannst nur eigene Dateien entfernen." };
  revalidatePath(`/baustellen/${projektId}`, "layout");
  return {};
}
