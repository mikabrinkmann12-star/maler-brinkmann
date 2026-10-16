import "server-only";
import type { KalDaten } from "@/lib/kalender";
import { createClient } from "@/lib/supabase/server";

/** Alles, was Wochen-/Monatsansicht der Plantafel für einen Zeitraum braucht (nur Büro/Admin aufrufen). */
export async function kalenderLaden(von: string, bis: string) {
  const supabase = await createClient();
  const [einsaetze, termine, urlaub, krank, profile] = await Promise.all([
    supabase
      .from("assignments")
      .select("datum, vehicles(name), assignment_members(user_id), assignment_stops(project_id, sortierung, projects(name))")
      .gte("datum", von)
      .lte("datum", bis),
    supabase
      .from("appointments")
      .select("datum, titel, project_id, appointment_members(user_id)")
      .gte("datum", von)
      .lte("datum", bis)
      .is("archiviert_am", null),
    supabase
      .from("leave_requests")
      .select("user_id, von, bis, art, status")
      .in("status", ["offen", "genehmigt"])
      .lte("von", bis)
      .gte("bis", von),
    supabase.from("time_entries").select("user_id, datum").eq("art", "krank").is("archiviert_am", null).gte("datum", von).lte("datum", bis),
    supabase.from("profiles").select("id, vorname, nachname, rolle").eq("aktiv", true).order("vorname"),
  ]);
  if (einsaetze.error || termine.error || urlaub.error || krank.error || profile.error) {
    throw new Error("Die Plantafel konnte nicht geladen werden.");
  }

  const projektNamen = new Map<string, string>();
  const daten: KalDaten = {
    einsaetze: einsaetze.data.map((e) => ({
      datum: e.datum,
      fahrzeug: e.vehicles?.name ?? "Ohne Firmenwagen",
      projekte: [...e.assignment_stops]
        .sort((a, b) => a.sortierung - b.sortierung)
        .map((s) => {
          projektNamen.set(s.project_id, s.projects?.name ?? "Baustelle");
          return { id: s.project_id, name: s.projects?.name ?? "Baustelle" };
        }),
      mitarbeiterIds: e.assignment_members.map((m) => m.user_id),
    })),
    termine: termine.data.map((t) => ({
      datum: t.datum,
      titel: t.titel,
      projectId: t.project_id,
      personIds: t.appointment_members.map((m) => m.user_id),
    })),
    abwesenheiten: urlaub.data.map((u) => ({
      userId: u.user_id,
      von: u.von,
      bis: u.bis,
      art: u.art as "urlaub" | "unbezahlter_urlaub",
      status: u.status as "offen" | "genehmigt",
    })),
    krank: krank.data.map((k) => ({ userId: k.user_id, datum: k.datum })),
  };
  // Mitarbeiter zuerst, dann Büro/Admin
  const personen = [...profile.data].sort((a, b) => Number(a.rolle !== "mitarbeiter") - Number(b.rolle !== "mitarbeiter"));
  return { daten, personen, projektNamen };
}
