"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { istIsoDatum, tageVerschieben } from "@/lib/datum";
import { formatDatum } from "@/lib/format";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

const SEITE = "/buero/plantafel";

const kartenSchema = z.array(
  z.object({
    assignmentId: z.uuid().nullable(),
    vehicleId: z.uuid().nullable(),
    projectId: z.uuid().nullable(),
    mitarbeiterIds: z.array(z.uuid()),
    notiz: z.string().trim().max(500),
  }),
);
export type EinsatzKarte = z.infer<typeof kartenSchema>[number];

export type SpeichernErgebnis = { fehler?: string; gespeichert?: number };

/**
 * Speichert die geänderten Karten eines Tages.
 * Leere Karte (keine Baustelle, keine Leute, keine Notiz) = Einsatz entfernen.
 */
export async function einsaetzeSpeichern(
  datum: string,
  eingabe: EinsatzKarte[],
): Promise<SpeichernErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!istIsoDatum(datum)) return { fehler: "Ungültiges Datum." };
  const pruefung = kartenSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: "Ungültige Eingabe." };

  const supabase = await createClient();
  let gespeichert = 0;

  for (const karte of pruefung.data) {
    const leer = !karte.projectId && !karte.mitarbeiterIds.length && !karte.notiz;

    if (leer) {
      if (karte.assignmentId) {
        const { error } = await supabase.from("assignments").delete().eq("id", karte.assignmentId);
        if (error) return { fehler: "Ein Einsatz konnte nicht entfernt werden.", gespeichert };
        gespeichert++;
      }
      continue;
    }

    let id = karte.assignmentId;
    const felder = { project_id: karte.projectId, notiz: karte.notiz || null };
    if (id) {
      const { error } = await supabase.from("assignments").update(felder).eq("id", id);
      if (error) return { fehler: "Ein Einsatz konnte nicht gespeichert werden.", gespeichert };
    } else {
      const { data, error } = await supabase
        .from("assignments")
        .insert({ ...felder, datum, vehicle_id: karte.vehicleId })
        .select("id")
        .single();
      if (error) {
        return {
          fehler:
            error.code === "23505"
              ? "Für dieses Auto gibt es an dem Tag schon einen Einsatz. Bitte Seite neu laden."
              : "Ein Einsatz konnte nicht angelegt werden.",
          gespeichert,
        };
      }
      id = data.id;
    }

    // Mitarbeiter abgleichen: Weggefallene entfernen, Neue hinzufügen
    const { data: bisher } = await supabase
      .from("assignment_members")
      .select("user_id")
      .eq("assignment_id", id);
    const vorher = new Set((bisher ?? []).map((m) => m.user_id));
    const nachher = new Set(karte.mitarbeiterIds);
    const weg = [...vorher].filter((u) => !nachher.has(u));
    const neu = [...nachher].filter((u) => !vorher.has(u));

    if (weg.length) {
      const { error } = await supabase
        .from("assignment_members")
        .delete()
        .eq("assignment_id", id)
        .in("user_id", weg);
      if (error) return { fehler: "Mitarbeiter konnten nicht entfernt werden.", gespeichert };
    }
    if (neu.length) {
      const { error } = await supabase
        .from("assignment_members")
        .insert(neu.map((user_id) => ({ assignment_id: id!, user_id })));
      if (error) return { fehler: "Mitarbeiter konnten nicht eingeteilt werden.", gespeichert };
    }
    gespeichert++;
  }

  revalidatePath(SEITE);
  return { gespeichert };
}

export type WieGesternErgebnis = { fehler?: string; hinweis?: string };

/**
 * Übernimmt die Einteilung des letzten Tages mit Einsätzen (max. 7 Tage zurück),
 * aber nur für Autos, die am Ziel-Tag noch frei sind. Notizen werden nicht kopiert.
 */
export async function wieGestern(datum: string): Promise<WieGesternErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!istIsoDatum(datum)) return { fehler: "Ungültiges Datum." };
  const supabase = await createClient();

  const { data: quelle } = await supabase
    .from("assignments")
    .select("datum")
    .lt("datum", datum)
    .gte("datum", tageVerschieben(datum, -7))
    .order("datum", { ascending: false })
    .limit(1);
  const quellDatum = quelle?.[0]?.datum;
  if (!quellDatum) return { hinweis: "In den letzten 7 Tagen gibt es keine Einteilung zum Übernehmen." };

  const [{ data: vorlagen }, { data: vorhanden }] = await Promise.all([
    supabase
      .from("assignments")
      .select("vehicle_id, project_id, assignment_members(user_id)")
      .eq("datum", quellDatum),
    supabase.from("assignments").select("vehicle_id").eq("datum", datum),
  ]);

  const belegt = new Set((vorhanden ?? []).map((a) => a.vehicle_id));
  const hatOhneAuto = belegt.has(null);
  let kopiert = 0;

  for (const v of vorlagen ?? []) {
    if (v.vehicle_id ? belegt.has(v.vehicle_id) : hatOhneAuto) continue;
    const { data: neu, error } = await supabase
      .from("assignments")
      .insert({ datum, vehicle_id: v.vehicle_id, project_id: v.project_id })
      .select("id")
      .single();
    if (error || !neu) continue;
    const leute = v.assignment_members.map((m) => ({ assignment_id: neu.id, user_id: m.user_id }));
    if (leute.length) await supabase.from("assignment_members").insert(leute);
    kopiert++;
  }

  revalidatePath(SEITE);
  return {
    hinweis: kopiert
      ? `${kopiert} ${kopiert === 1 ? "Einsatz" : "Einsätze"} vom ${formatDatum(quellDatum)} übernommen.`
      : `Alle Autos sind schon eingeteilt – vom ${formatDatum(quellDatum)} wurde nichts übernommen.`,
  };
}
