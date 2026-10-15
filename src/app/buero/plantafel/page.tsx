import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { heuteIso, istIsoDatum } from "@/lib/datum";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { Einteilung, type EinsatzDaten, type ProjektOption } from "./einteilung";

export const metadata: Metadata = { title: "Einteilung" };

// Diese Status stehen in der Auswahl oben (aktuelle Baustellen)
const AKTUELL = ["In Arbeit", "Auftrag erteilt"];

export default async function EinteilungSeite({ searchParams }: PageProps<"/buero/plantafel">) {
  await requireRole(BUERO_ROLLEN);
  const { datum: datumParam } = await searchParams;
  const datum = istIsoDatum(datumParam) ? datumParam : heuteIso();

  const supabase = await createClient();
  const [fahrzeuge, projekte, profile, einsaetze] = await Promise.all([
    supabase.from("vehicles").select("id, name, kennzeichen").eq("aktiv", true).order("name"),
    supabase
      .from("projects")
      .select(
        "id, projektnummer, name, baustelle_strasse, baustelle_ort, project_statuses(name, sortierung), contacts(firmenname, nachname)",
      )
      .is("archiviert_am", null)
      .order("name"),
    supabase.from("profiles").select("id, vorname, nachname, rolle").eq("aktiv", true).order("vorname"),
    supabase
      .from("assignments")
      .select("id, vehicle_id, project_id, notiz, assignment_members(user_id)")
      .eq("datum", datum),
  ]);
  if (fahrzeuge.error || projekte.error || profile.error || einsaetze.error) {
    throw new Error("Die Einteilung konnte nicht geladen werden.");
  }

  const projektOptionen: ProjektOption[] = projekte.data.map((p) => {
    const kunde = p.contacts?.firmenname || p.contacts?.nachname || "";
    return {
      id: p.id,
      name: p.name,
      ort: p.baustelle_ort ?? "",
      aktuell: AKTUELL.includes(p.project_statuses?.name ?? ""),
      stichworte: [kunde, p.baustelle_ort ?? "", p.baustelle_strasse ?? "", p.projektnummer].filter(Boolean),
    };
  });

  // Mitarbeiter zuerst, dann Büro/Admin (die fahren manchmal mit)
  const mitarbeiter = [...profile.data].sort(
    (a, b) => Number(a.rolle !== "mitarbeiter") - Number(b.rolle !== "mitarbeiter"),
  );

  const daten: EinsatzDaten[] = einsaetze.data.map((e) => ({
    assignmentId: e.id,
    vehicleId: e.vehicle_id,
    projectId: e.project_id,
    notiz: e.notiz ?? "",
    mitarbeiterIds: e.assignment_members.map((m) => m.user_id),
  }));

  return (
    <Einteilung
      // Nach dem Speichern neu starten, damit die Karten den gespeicherten Stand zeigen
      key={`${datum}-${JSON.stringify(daten)}`}
      datum={datum}
      heute={heuteIso()}
      fahrzeuge={fahrzeuge.data}
      projekte={projektOptionen}
      mitarbeiter={mitarbeiter.map((m) => ({ id: m.id, vorname: m.vorname, nachname: m.nachname }))}
      einsaetze={daten}
    />
  );
}
