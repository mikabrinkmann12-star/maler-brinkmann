"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBueroRecht, requireUser } from "@/lib/auth";
import { FOTO_KATEGORIEN, fotoPfade } from "@/lib/bild";
import { createClient } from "@/lib/supabase/server";

export type TeamErgebnis = { fehler?: string };
const id = z.uuid();

/** Kernfeature: Kollegen zu einer eigenen Baustelle hinzufügen (RLS prüft „eigene“). */
export async function kollegeHinzufuegen(projektId: string, userId: string): Promise<TeamErgebnis> {
  const nutzer = await requireUser();
  if (!id.safeParse(projektId).success || !id.safeParse(userId).success) return { fehler: "Ungültige Eingabe." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .insert({ project_id: projektId, user_id: userId, added_by: nutzer.id });
  if (error) {
    return {
      fehler: error.code === "23505"
        ? "Ist schon auf der Baustelle."
        : "Hinzufügen geht nur auf Baustellen, auf denen du selbst eingetragen bist.",
    };
  }
  revalidatePath(`/baustellen/${projektId}`, "layout");
  return {};
}

/** Zuordnung wieder entfernen – nur Büro/Admin. */
export async function kollegeEntfernen(projektId: string, userId: string): Promise<TeamErgebnis> {
  await requireBueroRecht("kollegen_hinzufuegen");
  if (!id.safeParse(projektId).success || !id.safeParse(userId).success) return { fehler: "Ungültige Eingabe." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projektId)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { fehler: "Entfernen hat nicht geklappt." };
  revalidatePath(`/baustellen/${projektId}`, "layout");
  return {};
}

// ---------------------------------------------------------------------------
// Notizen und Fotos. Alle Aktionen sind idempotent (die App erzeugt die IDs),
// damit die Warteschlange gefahrlos erneut senden kann.
// ---------------------------------------------------------------------------
export type InhaltErgebnis = { fehler?: string };

const notizSchema = z.object({
  id: z.uuid(),
  projektId: z.uuid(),
  text: z.string().trim().min(1, "Bitte etwas schreiben.").max(2000, "Die Notiz ist zu lang (höchstens 2.000 Zeichen)."),
});

export async function notizAnlegen(eingabe: unknown): Promise<InhaltErgebnis> {
  const nutzer = await requireUser();
  const pruefung = notizSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { id: notizId, projektId, text } = pruefung.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_notes")
    .insert({ id: notizId, project_id: projektId, text, erstellt_von: nutzer.id });
  if (error && error.code !== "23505") {
    return { fehler: "Notizen gehen nur auf Baustellen, auf denen du eingetragen bist." };
  }
  revalidatePath(`/baustellen/${projektId}`, "layout");
  return {};
}

/** Löschen = archivieren: eigene Einträge (als Mitglied) oder Büro/Admin. RLS prüft. */
async function archivieren(
  tabelle: "project_notes" | "project_photos" | "material_usage",
  eintragId: string,
): Promise<InhaltErgebnis> {
  await requireUser();
  if (!id.safeParse(eintragId).success) return { fehler: "Ungültiger Eintrag." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(tabelle)
    .update({ archiviert_am: new Date().toISOString() })
    .eq("id", eintragId)
    .is("archiviert_am", null)
    .select("project_id");
  if (error) return { fehler: "Löschen hat nicht geklappt." };
  if (!data.length) {
    const { data: schon } = await supabase.from(tabelle).select("project_id, archiviert_am").eq("id", eintragId).maybeSingle();
    if (schon?.archiviert_am) return {}; // schon erledigt
    return { fehler: "Löschen kannst du nur deine eigenen Einträge." };
  }
  revalidatePath(`/baustellen/${data[0].project_id}`, "layout");
  return {};
}

export async function notizArchivieren(notizId: string): Promise<InhaltErgebnis> {
  return archivieren("project_notes", notizId);
}

export async function fotoArchivieren(fotoId: string): Promise<InhaltErgebnis> {
  return archivieren("project_photos", fotoId);
}

const fotoSchema = z.object({
  id: z.uuid(),
  projektId: z.uuid(),
  kategorie: z.enum(FOTO_KATEGORIEN),
  kommentar: z.string().trim().max(500, "Der Kommentar ist zu lang (höchstens 500 Zeichen).").default(""),
  breite: z.number().int().positive().max(10000),
  hoehe: z.number().int().positive().max(10000),
  groesseBytes: z.number().int().positive().max(10 * 1024 * 1024),
});

/** Foto-Datensatz anlegen, NACHDEM das Bild im Speicher liegt (Upload direkt aus dem Browser). */
export async function fotoSpeichern(eingabe: unknown): Promise<InhaltErgebnis> {
  const nutzer = await requireUser();
  const pruefung = fotoSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const f = pruefung.data;
  const pfad = fotoPfade(f.projektId, f.id).bild;

  const supabase = await createClient();
  // Nur Datensätze zu Bildern, die wirklich hochgeladen sind
  const { data: dateien } = await supabase.storage.from("projektfotos").list(f.projektId, { search: `${f.id}.jpg` });
  if (!dateien?.some((d) => d.name === `${f.id}.jpg`)) return { fehler: "Das Bild ist nicht angekommen. Bitte nochmal senden." };

  const { error } = await supabase.from("project_photos").insert({
    id: f.id,
    project_id: f.projektId,
    storage_pfad: pfad,
    kategorie: f.kategorie,
    kommentar: f.kommentar || null,
    breite: f.breite,
    hoehe: f.hoehe,
    groesse_bytes: f.groesseBytes,
    erstellt_von: nutzer.id,
  });
  if (error && error.code !== "23505") {
    return { fehler: "Fotos gehen nur auf Baustellen, auf denen du eingetragen bist." };
  }
  revalidatePath(`/baustellen/${f.projektId}`, "layout");
  return {};
}

// ---------------------------------------------------------------------------
// Material melden (freier Text, Katalog ab Phase 3)
// ---------------------------------------------------------------------------
const materialSchema = z.object({
  id: z.uuid(),
  projektId: z.uuid(),
  material: z.string().trim().min(1, "Bitte angeben, welches Material gebraucht wird.").max(200, "Der Text ist zu lang (höchstens 200 Zeichen)."),
  menge: z.number({ error: "Bitte eine Menge angeben." }).positive("Bitte eine Menge über 0 angeben.").max(99_999_999),
  einheit: z.string().trim().min(1, "Bitte eine Einheit wählen.").max(20, "Die Einheit ist zu lang."),
  bemerkung: z.string().trim().max(500, "Die Bemerkung ist zu lang (höchstens 500 Zeichen).").default(""),
});

export async function materialMelden(eingabe: unknown): Promise<InhaltErgebnis> {
  const nutzer = await requireUser();
  const pruefung = materialSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const m = pruefung.data;

  const supabase = await createClient();
  const { error } = await supabase.from("material_usage").insert({
    id: m.id,
    project_id: m.projektId,
    material: m.material,
    menge: Math.round(m.menge * 100) / 100,
    einheit: m.einheit,
    bemerkung: m.bemerkung || null,
    erstellt_von: nutzer.id,
  });
  if (error && error.code !== "23505") {
    return { fehler: "Material melden geht nur auf Baustellen, auf denen du eingetragen bist." };
  }
  revalidatePath(`/baustellen/${m.projektId}`, "layout");
  revalidatePath("/buero");
  return {};
}

export async function materialArchivieren(materialId: string): Promise<InhaltErgebnis> {
  const r = await archivieren("material_usage", materialId);
  revalidatePath("/buero");
  return r;
}

/** Büro hakt Material als besorgt/erledigt ab (oder nimmt den Haken zurück). */
export async function materialErledigt(materialId: string, erledigt: boolean): Promise<InhaltErgebnis> {
  await requireBueroRecht("baustelle_eintragen");
  if (!id.safeParse(materialId).success) return { fehler: "Ungültiger Eintrag." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_usage")
    .update({ erledigt_am: erledigt ? new Date().toISOString() : null })
    .eq("id", materialId)
    .select("project_id");
  if (error || !data.length) return { fehler: "Speichern hat nicht geklappt." };
  revalidatePath(`/baustellen/${data[0].project_id}`, "layout");
  revalidatePath("/buero");
  return {};
}

// ---------------------------------------------------------------------------
// Projekt archivieren / wiederherstellen (nur Büro/Admin, nichts wird gelöscht)
// ---------------------------------------------------------------------------
export async function projektArchivieren(projektId: string, archivieren: boolean): Promise<InhaltErgebnis> {
  await requireBueroRecht("projekte_bearbeiten");
  if (!id.safeParse(projektId).success) return { fehler: "Ungültiges Projekt." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ archiviert_am: archivieren ? new Date().toISOString() : null })
    .eq("id", projektId)
    .select("id");
  if (error || !data.length) return { fehler: "Das hat nicht geklappt." };
  revalidatePath(`/baustellen/${projektId}`, "layout");
  revalidatePath("/baustellen", "layout");
  revalidatePath("/buero/projekte");
  return {};
}
