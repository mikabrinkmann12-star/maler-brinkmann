"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { terminSchema } from "@/lib/termin-schema";

// Termine: Jeder Mitarbeiter trägt eigene Termine ein, das Büro für alle.
// Idempotent (ID kommt aus der App), läuft deshalb auch über die Warteschlange.

export type TerminErgebnis = { fehler?: string };

function aktualisieren() {
  revalidatePath("/termine");
  revalidatePath("/heute");
  revalidatePath("/buero/plantafel", "layout");
}

/** Neuen Termin anlegen oder einen vorhandenen ändern (gleiche ID). */
export async function terminSpeichern(eingabe: unknown): Promise<TerminErgebnis> {
  const nutzer = await requireUser();
  const pruefung = terminSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const t = pruefung.data;
  const istBuero = istBueroRolle(nutzer.rolle);
  // Mitarbeiter können nur sich selbst eintragen
  const personen = istBuero ? t.personIds : [nutzer.id];
  if (!personen.length) return { fehler: "Bitte mindestens eine Person wählen." };

  const supabase = await createClient();
  const felder = {
    datum: t.datum,
    titel: t.titel,
    zeit: t.zeit || null,
    ort: t.ort || null,
    project_id: t.projectId,
    notiz: t.notiz || null,
  };

  const { data: vorhanden } = await supabase.from("appointments").select("id, erstellt_von").eq("id", t.id).maybeSingle();
  if (vorhanden) {
    if (!istBuero && vorhanden.erstellt_von !== nutzer.id) return { fehler: "Das ist nicht dein Termin." };
    const { error } = await supabase.from("appointments").update(felder).eq("id", t.id);
    if (error) return { fehler: "Der Termin konnte nicht gespeichert werden." };
  } else {
    const { error } = await supabase.from("appointments").insert({ id: t.id, ...felder, erstellt_von: nutzer.id });
    if (error && error.code !== "23505") {
      return { fehler: "Der Termin konnte nicht angelegt werden (Baustelle nur aus deinen Baustellen)." };
    }
  }

  // Teilnehmer abgleichen (Mitarbeiter: immer nur man selbst, das Büro kann ändern)
  const { data: bisher } = await supabase.from("appointment_members").select("user_id").eq("appointment_id", t.id);
  const vorher = new Set((bisher ?? []).map((m) => m.user_id));
  const neu = personen.filter((p) => !vorher.has(p));
  const weg = istBuero ? [...vorher].filter((p) => !personen.includes(p)) : [];
  if (weg.length) {
    const { error } = await supabase.from("appointment_members").delete().eq("appointment_id", t.id).in("user_id", weg);
    if (error) return { fehler: "Personen konnten nicht entfernt werden." };
  }
  if (neu.length) {
    const { error } = await supabase.from("appointment_members").insert(neu.map((user_id) => ({ appointment_id: t.id, user_id })));
    if (error) return { fehler: "Personen konnten nicht eingetragen werden." };
  }

  aktualisieren();
  return {};
}

/** Löschen = archivieren (eigener Termin oder Büro/Admin, RLS prüft). */
export async function terminArchivieren(terminId: string): Promise<TerminErgebnis> {
  await requireUser();
  if (!z.uuid().safeParse(terminId).success) return { fehler: "Ungültiger Termin." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ archiviert_am: new Date().toISOString() })
    .eq("id", terminId)
    .is("archiviert_am", null)
    .select("id");
  if (error) return { fehler: "Löschen hat nicht geklappt." };
  if (!data.length) {
    const { data: schon } = await supabase.from("appointments").select("archiviert_am").eq("id", terminId).maybeSingle();
    return schon?.archiviert_am ? {} : { fehler: "Löschen kannst du nur deine eigenen Termine." };
  }
  aktualisieren();
  return {};
}
