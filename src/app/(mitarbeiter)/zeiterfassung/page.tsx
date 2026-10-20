import type { Metadata } from "next";
import { SeitenKopf } from "@/components/layout/seiten-kopf";
import { requireRecht } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { meineEinsaetze, meineProjektIds } from "@/lib/mitarbeiter-daten";
import { createClient } from "@/lib/supabase/server";
import { sollAufloesen, standardSoll, tagesSoll, type SollEinstellung } from "@/lib/ueberstunden";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";
import { uhrzeitKurz } from "@/lib/zeiten";
import { Warteschlange } from "../warteschlange";
import { Stempeluhr, type HeuteEintrag } from "./stempeluhr";

export const metadata: Metadata = { title: "Zeiterfassung" };

// Stempeluhr: Projekt wählen, „Zum Einstempeln wischen“, später ausstempeln. Beim Ausstempeln entsteht ein normaler Zeiteintrag.
export default async function ZeiterfassungSeite() {
  const nutzer = await requireRecht("zeiten_eigene");
  const heute = heuteIso();
  const supabase = await createClient();
  const ids = await meineProjektIds(nutzer.id);

  const [{ data: uhr }, { data: projekte }, { data: eintraege }, { data: profil }, einstellungen, einsaetze] = await Promise.all([
    supabase.from("stempeluhr").select("project_id, gestartet_am").eq("user_id", nutzer.id).maybeSingle(),
    ids.length
      ? supabase.from("projects").select("id, name").in("id", ids).is("archiviert_am", null).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase
      .from("time_entries")
      .select("id, von, bis, stunden, art, pause_min, projects(name)")
      .eq("user_id", nutzer.id)
      .eq("datum", heute)
      .is("archiviert_am", null)
      .order("von", { ascending: true }),
    supabase.from("profiles").select("soll_mo, soll_di, soll_mi, soll_do, soll_fr").eq("id", nutzer.id).maybeSingle(),
    zeiterfassungEinstellungen(),
    meineEinsaetze(nutzer.id, heute),
  ]);

  const soll = sollAufloesen(
    [profil?.soll_mo, profil?.soll_di, profil?.soll_mi, profil?.soll_do, profil?.soll_fr].map((x) => (x == null ? null : Number(x))) as SollEinstellung,
    standardSoll(einstellungen),
  );
  // Vorausgewählt: die Baustelle aus dem heutigen Einsatz, sonst das einzige Projekt
  const einsatzProjekte = einsaetze.flatMap((e) => e.assignment_stops.map((s) => s.projects?.id)).filter((x): x is string => Boolean(x));
  const liste = projekte ?? [];
  const standardProjekt = einsatzProjekte.find((id) => liste.some((p) => p.id === id)) ?? (liste.length === 1 ? liste[0].id : "");

  const heuteEintraege: HeuteEintrag[] = (eintraege ?? []).map((e) => ({
    id: e.id,
    von: uhrzeitKurz(e.von),
    bis: uhrzeitKurz(e.bis),
    stunden: Number(e.stunden),
    art: e.art,
    pauseMin: e.pause_min,
    projekt: e.projects?.name ?? "",
  }));

  return (
    <div className="flex flex-1 flex-col gap-5">
      <SeitenKopf titel="Zeiterfassung" zurueck="/zeiten" />
      <Warteschlange userId={nutzer.id} />
      <Stempeluhr
        heute={heute}
        laufend={uhr ? { projektId: uhr.project_id, gestartetAm: uhr.gestartet_am } : null}
        projekte={liste}
        standardProjekt={standardProjekt}
        eintraege={heuteEintraege}
        sollHeute={tagesSoll(heute, soll)}
      />
    </div>
  );
}
