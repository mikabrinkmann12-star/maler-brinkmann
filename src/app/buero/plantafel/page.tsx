import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { heuteIso, istIsoDatum } from "@/lib/datum";
import { stoppsSortieren } from "@/lib/einsatz";
import { adresseText } from "@/lib/projekt";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { Einteilung, type ProjektOption } from "./einteilung";
import { PlantafelTabs } from "./tabs";

export const metadata: Metadata = { title: "Einteilung" };

// Diese Status stehen in der Auswahl oben (aktuelle Baustellen)
const AKTUELL = ["In Arbeit", "Auftrag erteilt"];

export default async function EinteilungSeite({ searchParams }: PageProps<"/buero/plantafel">) {
  await requireRole(BUERO_ROLLEN);
  const { datum: datumParam } = await searchParams;
  const datum = istIsoDatum(datumParam) ? datumParam : heuteIso();

  const supabase = await createClient();
  const [fahrzeuge, projekte, profile, einsaetze, termine, urlaub, krank] = await Promise.all([
    supabase.from("vehicles").select("id, name, kennzeichen").eq("aktiv", true).order("name"),
    supabase
      .from("projects")
      .select(
        "id, projektnummer, name, baustelle_strasse, baustelle_plz, baustelle_ort, project_statuses(name, sortierung), contacts(firmenname, nachname)",
      )
      .is("archiviert_am", null)
      .order("name"),
    supabase.from("profiles").select("id, vorname, nachname, rolle").eq("aktiv", true).order("vorname"),
    supabase
      .from("assignments")
      .select("id, vehicle_id, notiz, assignment_members(user_id), assignment_stops(project_id, sortierung, zeit, zeit_art, notiz)")
      .eq("datum", datum),
    supabase
      .from("appointments")
      .select("id, titel, ort, zeit, project_id, appointment_members(user_id)")
      .eq("datum", datum)
      .is("archiviert_am", null)
      .order("zeit", { nullsFirst: false }),
    supabase
      .from("leave_requests")
      .select("user_id, art")
      .eq("status", "genehmigt")
      .lte("von", datum)
      .gte("bis", datum),
    supabase.from("time_entries").select("user_id").eq("datum", datum).eq("art", "krank").is("archiviert_am", null),
  ]);
  if (fahrzeuge.error || projekte.error || profile.error || einsaetze.error || termine.error) {
    throw new Error("Die Einteilung konnte nicht geladen werden.");
  }

  const projektOptionen: ProjektOption[] = projekte.data.map((p) => {
    const kunde = p.contacts?.firmenname || p.contacts?.nachname || "";
    return {
      id: p.id,
      name: p.name,
      ort: p.baustelle_ort ?? "",
      adresse: adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort }),
      aktuell: AKTUELL.includes(p.project_statuses?.name ?? ""),
      stichworte: [kunde, p.baustelle_ort ?? "", p.baustelle_strasse ?? "", p.projektnummer].filter(Boolean),
    };
  });

  // Mitarbeiter zuerst, dann Büro/Admin (die fahren manchmal mit)
  const mitarbeiter = [...profile.data].sort(
    (a, b) => Number(a.rolle !== "mitarbeiter") - Number(b.rolle !== "mitarbeiter"),
  );

  const daten = einsaetze.data.map((e) => ({
    assignmentId: e.id,
    vehicleId: e.vehicle_id,
    stopps: stoppsSortieren(e.assignment_stops).map((s) => ({
      projectId: s.project_id,
      zeit: s.zeit ? s.zeit.slice(0, 5) : null,
      zeitArt: s.zeit_art,
      notiz: s.notiz ?? "",
    })),
    mitarbeiterIds: e.assignment_members.map((m) => m.user_id),
    notiz: e.notiz ?? "",
  }));

  // Wer ist heute nicht da? (genehmigter Urlaub, Krank-Eintrag)
  const abwesend: Record<string, string> = {};
  for (const u of urlaub.data ?? []) abwesend[u.user_id] = u.art === "urlaub" ? "Urlaub" : "Unbezahlter Urlaub";
  for (const k of krank.data ?? []) abwesend[k.user_id] = "Krank";

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <PlantafelTabs aktiv="tag" datum={datum} />
      <Einteilung
        // Nach dem Speichern neu starten, damit die Karten den gespeicherten Stand zeigen
        key={`${datum}-${JSON.stringify(daten)}`}
        datum={datum}
        heute={heuteIso()}
        fahrzeuge={fahrzeuge.data}
        projekte={projektOptionen}
        mitarbeiter={mitarbeiter.map((m) => ({ id: m.id, vorname: m.vorname, nachname: m.nachname }))}
        einsaetze={daten}
        termine={termine.data.map((t) => ({
          id: t.id,
          titel: t.titel,
          ort: t.ort ?? "",
          zeit: t.zeit ? t.zeit.slice(0, 5) : null,
          projectId: t.project_id,
          personIds: t.appointment_members.map((m) => m.user_id),
        }))}
        abwesend={abwesend}
      />
    </div>
  );
}
