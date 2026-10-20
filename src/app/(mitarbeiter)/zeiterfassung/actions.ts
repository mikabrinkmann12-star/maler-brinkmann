"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { formatDatum } from "@/lib/format";
import { berlinZeit, stempelEintrag } from "@/lib/stempeluhr";
import { createClient } from "@/lib/supabase/server";
import { ZEIT_ART_NAMEN } from "@/lib/zeiten";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";
import { zeitenAnlegen } from "../zeiten/actions";

// Stempeluhr: Einstempeln legt eine Zeile in `stempeluhr` an (ein Eintrag pro Person), Ausstempeln macht daraus
// einen normalen Zeiteintrag über `zeitenAnlegen` (gleiche Regeln: Überschneidung, Sperrfrist, erlaubte Art).
// Idempotent: Die Eintrags-ID steht schon in der Uhr-Zeile, ein zweites Ausstempeln speichert nichts doppelt.

export type StempelErgebnis = { fehler?: string; meldung?: string };

function aktualisieren() {
  revalidatePath("/zeiterfassung");
  revalidatePath("/zeiten", "layout");
  revalidatePath("/heute");
}

export async function einstempeln(projektId: unknown): Promise<StempelErgebnis> {
  const nutzer = await requireUser();
  const id = z.uuid("Bitte zuerst ein Projekt wählen.").safeParse(projektId);
  if (!id.success) return { fehler: id.error.issues[0]?.message ?? "Bitte zuerst ein Projekt wählen." };

  const supabase = await createClient();
  const { error } = await supabase.from("stempeluhr").insert({ user_id: nutzer.id, project_id: id.data });
  if (error) {
    if (error.code === "23505") {
      // Es läuft schon eine Uhr (z. B. zweiter Versuch nach einem Funkloch): kein Fehler, wenn es dasselbe Projekt ist
      const { data } = await supabase.from("stempeluhr").select("project_id").eq("user_id", nutzer.id).maybeSingle();
      if (data?.project_id === id.data) return {};
      return { fehler: "Es läuft schon eine Uhr auf einem anderen Projekt. Bitte erst ausstempeln." };
    }
    if (error.code === "42501") return { fehler: "Auf diesem Projekt darfst du dich nicht einstempeln." };
    return { fehler: "Einstempeln hat nicht geklappt. Bitte nochmal versuchen." };
  }
  aktualisieren();
  return {};
}

export async function ausstempeln(): Promise<StempelErgebnis> {
  const nutzer = await requireUser();
  const supabase = await createClient();
  const { data: uhr } = await supabase
    .from("stempeluhr")
    .select("project_id, art, gestartet_am, eintrag_id")
    .eq("user_id", nutzer.id)
    .maybeSingle();
  if (!uhr) return {}; // schon ausgestempelt (zweiter Versuch)

  const einstellungen = await zeiterfassungEinstellungen();
  const ende = new Date();
  const start = new Date(uhr.gestartet_am);
  const startTag = berlinZeit(start).datum;
  // Gibt es am Starttag schon eine Pause? Dann keine zweite automatisch.
  const { data: vorhanden } = await supabase
    .from("time_entries")
    .select("pause_min")
    .eq("user_id", nutzer.id)
    .eq("datum", startTag)
    .is("archiviert_am", null)
    .gt("pause_min", 0);
  const eintrag = stempelEintrag(start, ende, einstellungen, (vorhanden?.length ?? 0) > 0);
  if ("fehler" in eintrag) {
    await supabase.from("stempeluhr").delete().eq("user_id", nutzer.id);
    aktualisieren();
    return { fehler: eintrag.fehler };
  }

  const ergebnis = await zeitenAnlegen({
    daten: {
      datum: eintrag.datum,
      projektId: uhr.project_id,
      art: uhr.art,
      modus: "uhrzeit",
      von: eintrag.von,
      bis: eintrag.bis,
      pauseMin: eintrag.pauseMin,
      stunden: 0,
      beschreibung: "",
    },
    personen: [{ eintragId: uhr.eintrag_id, userId: nutzer.id }],
  });
  if (ergebnis.fehler) return { fehler: `${ergebnis.fehler} Die Uhr läuft weiter. Du kannst sie verwerfen und die Zeit von Hand eintragen.` };

  await supabase.from("stempeluhr").delete().eq("user_id", nutzer.id);
  aktualisieren();
  const pause = eintrag.pauseMin > 0 ? `, ${eintrag.pauseMin} Min. Pause` : "";
  return {
    meldung: `${ZEIT_ART_NAMEN[uhr.art]} ${eintrag.von}–${eintrag.bis}${pause} am ${formatDatum(eintrag.datum)} eingetragen.${eintrag.hinweis ? ` ${eintrag.hinweis}` : ""}`,
  };
}

/** Uhr verwerfen, ohne eine Zeit einzutragen (z. B. versehentlich eingestempelt). */
export async function stempeluhrVerwerfen(): Promise<StempelErgebnis> {
  const nutzer = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("stempeluhr").delete().eq("user_id", nutzer.id);
  if (error) return { fehler: "Das hat nicht geklappt. Bitte nochmal versuchen." };
  aktualisieren();
  return {};
}
