"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { istIsoDatum, tageVerschieben } from "@/lib/datum";
import { formatDatum } from "@/lib/format";
import { istUhrzeit } from "@/lib/zeiten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

const SEITE = "/buero/plantafel";

const stoppSchema = z
  .object({
    projectId: z.uuid(),
    zeit: z.string().refine(istUhrzeit).nullable(),
    zeitArt: z.enum(["um", "ab"]).nullable(),
    notiz: z.string().trim().max(200),
  })
  .refine((s) => (s.zeit === null) === (s.zeitArt === null), "Zeit und Art gehören zusammen.");

const kartenSchema = z.array(
  z
    .object({
      assignmentId: z.uuid().nullable(),
      vehicleId: z.uuid().nullable(),
      stopps: z.array(stoppSchema).max(8),
      mitarbeiterIds: z.array(z.uuid()),
      notiz: z.string().trim().max(500),
    })
    .refine((k) => new Set(k.stopps.map((s) => s.projectId)).size === k.stopps.length, "Eine Baustelle nur einmal pro Auto."),
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
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };

  const supabase = await createClient();
  let gespeichert = 0;

  for (const karte of pruefung.data) {
    const leer = !karte.stopps.length && !karte.mitarbeiterIds.length && !karte.notiz;

    if (leer) {
      if (karte.assignmentId) {
        const { error } = await supabase.from("assignments").delete().eq("id", karte.assignmentId);
        if (error) return { fehler: "Ein Einsatz konnte nicht entfernt werden.", gespeichert };
        gespeichert++;
      }
      continue;
    }

    let id = karte.assignmentId;
    if (id) {
      const { error } = await supabase.from("assignments").update({ notiz: karte.notiz || null }).eq("id", id);
      if (error) return { fehler: "Ein Einsatz konnte nicht gespeichert werden.", gespeichert };
    } else {
      const { data, error } = await supabase
        .from("assignments")
        .insert({ datum, vehicle_id: karte.vehicleId, notiz: karte.notiz || null })
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

    // Baustellen (Stopps) abgleichen: Weggefallene entfernen, Übrige anlegen bzw. aktualisieren
    const neueProjekte = karte.stopps.map((s) => s.projectId);
    const { data: bisherStopps } = await supabase.from("assignment_stops").select("project_id").eq("assignment_id", id);
    const wegStopps = (bisherStopps ?? []).map((s) => s.project_id).filter((p) => !neueProjekte.includes(p));
    if (wegStopps.length) {
      const { error } = await supabase.from("assignment_stops").delete().eq("assignment_id", id).in("project_id", wegStopps);
      if (error) return { fehler: "Baustellen konnten nicht entfernt werden.", gespeichert };
    }
    if (karte.stopps.length) {
      const { error } = await supabase.from("assignment_stops").upsert(
        karte.stopps.map((s, i) => ({
          assignment_id: id!,
          project_id: s.projectId,
          sortierung: i,
          zeit: s.zeit,
          zeit_art: s.zeitArt,
          notiz: s.notiz || null,
        })),
        { onConflict: "assignment_id,project_id" },
      );
      if (error) return { fehler: "Baustellen konnten nicht gespeichert werden.", gespeichert };
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
  revalidatePath("/heute");
  return { gespeichert };
}

export type WieGesternErgebnis = { fehler?: string; hinweis?: string };

/**
 * Übernimmt die Einteilung des letzten Tages mit Einsätzen (max. 7 Tage zurück),
 * aber nur für Autos, die am Ziel-Tag noch frei sind. Baustellen und Teams werden
 * kopiert, Notizen und Zeiten nicht (die gelten nur für den jeweiligen Tag).
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
      .select("vehicle_id, assignment_stops(project_id, sortierung), assignment_members(user_id)")
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
      .insert({ datum, vehicle_id: v.vehicle_id })
      .select("id")
      .single();
    if (error || !neu) continue;
    const stopps = [...v.assignment_stops]
      .sort((a, b) => a.sortierung - b.sortierung)
      .map((s, i) => ({ assignment_id: neu.id, project_id: s.project_id, sortierung: i }));
    if (stopps.length) await supabase.from("assignment_stops").insert(stopps);
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
