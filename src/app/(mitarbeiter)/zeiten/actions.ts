"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, type AktuellerNutzer } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatDatum } from "@/lib/format";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { neueZeitSchema, zeitDatenSchema, zeitZeile, type GepruefteZeitDaten } from "@/lib/zeit-schema";
import { ZEIT_ART_NAMEN, ueberschneidetSich, uhrzeitKurz, zeitNochAenderbar } from "@/lib/zeiten";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";

// Alle Aktionen sind „idempotent“: Kommt die Antwort nicht an (Funkloch) und
// die App schickt dieselbe Anfrage nochmal, entsteht kein doppelter Eintrag.
// Dafür erzeugt die App die IDs neuer Einträge selbst (siehe Warteschlange).
// Verbindlich prüft die Datenbank (RLS); die Prüfungen hier liefern vorher
// verständliche Meldungen.

export type ZeitErgebnis = { fehler?: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;
const uuid = z.uuid();

function aktualisieren() {
  revalidatePath("/zeiten", "layout");
  revalidatePath("/heute");
}

function dbMeldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "P0001") return fehler.message; // Meldungen der Trigger sind schon deutsch
  if (fehler.code === "42501") {
    return "Das darfst du nicht speichern. Prüfe Datum (Sperrfrist), Art und Baustelle.";
  }
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

/** Regeln für Mitarbeiter (Büro/Admin dürfen alles): erlaubte Art, Sperrfrist. */
async function mitarbeiterRegeln(nutzer: AktuellerNutzer, d: GepruefteZeitDaten): Promise<string | null> {
  if (istBueroRolle(nutzer.rolle)) return null;
  const e = await zeiterfassungEinstellungen();
  if (!e.erlaubteArten.includes(d.art)) return `„${ZEIT_ART_NAMEN[d.art]}“ trägt das Büro ein.`;
  const heute = heuteIso();
  if (d.datum > heute) return "Zeiten in der Zukunft kannst du noch nicht eintragen.";
  if (!zeitNochAenderbar(d.datum, heute, e.kulanzTage)) {
    return `Der ${formatDatum(d.datum)} ist schon abgeschlossen. Bitte im Büro melden.`;
  }
  return null;
}

/** Wer steht auf der Baustelle? (Mitarbeiter sehen nur Mitglieder eigener Baustellen.) */
async function baustellenTeam(supabase: Supabase, projektId: string): Promise<Set<string>> {
  const { data } = await supabase.from("project_members").select("user_id").eq("project_id", projektId);
  return new Set((data ?? []).map((m) => m.user_id));
}

/**
 * Überschneidet sich die neue Zeit mit vorhandenen Zeiten dieser Personen?
 * Geprüft werden alle Einträge, die der Nutzer sehen darf (eigene und selbst eingetragene).
 */
async function ueberschneidung(
  supabase: Supabase,
  d: GepruefteZeitDaten,
  personen: string[],
  ausserIds: string[],
  namen: Map<string, string>,
): Promise<string | null> {
  if (d.modus !== "uhrzeit") return null;
  const { data } = await supabase
    .from("time_entries")
    .select("id, user_id, von, bis, projects(name)")
    .eq("datum", d.datum)
    .in("user_id", personen)
    .is("archiviert_am", null)
    .not("von", "is", null);
  const treffer = (data ?? []).find(
    (t) =>
      !ausserIds.includes(t.id) &&
      t.von && t.bis &&
      ueberschneidetSich({ von: d.von, bis: d.bis }, { von: uhrzeitKurz(t.von), bis: uhrzeitKurz(t.bis) }),
  );
  if (!treffer) return null;
  const wer = namen.get(treffer.user_id) ?? "Du";
  const wo = treffer.projects?.name ? ` (${treffer.projects.name})` : "";
  return `${wer} ${wer === "Du" ? "hast" : "hat"} am ${formatDatum(d.datum)} schon ${uhrzeitKurz(treffer.von)}–${uhrzeitKurz(treffer.bis)}${wo} eingetragen. Zeiten dürfen sich nicht überschneiden.`;
}

async function namenLaden(supabase: Supabase, ich: AktuellerNutzer): Promise<Map<string, string>> {
  const { data } = await supabase.rpc("kollegen");
  const namen = new Map((data ?? []).map((k) => [k.id, k.vorname]));
  namen.set(ich.id, "Du");
  return namen;
}

// ---------------------------------------------------------------------------
// Neue Zeit (für mich und ggf. Kollegen derselben Baustelle)
// ---------------------------------------------------------------------------
export async function zeitenAnlegen(eingabe: unknown): Promise<ZeitErgebnis> {
  const nutzer = await requireUser();
  const pruefung = neueZeitSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const { daten: d, personen } = pruefung.data;

  const ids = personen.map((p) => p.eintragId);
  const userIds = personen.map((p) => p.userId);
  if (new Set(ids).size !== ids.length || new Set(userIds).size !== userIds.length) {
    return { fehler: "Jede Person nur einmal auswählen." };
  }
  if (!userIds.includes(nutzer.id) && !istBueroRolle(nutzer.rolle)) {
    return { fehler: "Du kannst Zeiten nur zusammen mit deiner eigenen eintragen." };
  }

  const supabase = await createClient();

  // Schon gespeichert? (zweiter Versuch nach einem Funkloch)
  const { data: vorhanden } = await supabase.from("time_entries").select("id").in("id", ids);
  if (vorhanden?.length === ids.length) return {};
  if (vorhanden?.length) return { fehler: "Ein Teil dieser Einträge ist schon gespeichert. Bitte die Liste prüfen." };

  const regel = await mitarbeiterRegeln(nutzer, d);
  if (regel) return { fehler: regel };

  const namen = await namenLaden(supabase, nutzer);
  const kollegen = userIds.filter((id) => id !== nutzer.id);
  if (kollegen.length) {
    if (!d.projektId) return { fehler: "Für Kollegen geht das nur mit einer Baustelle." };
    const team = await baustellenTeam(supabase, d.projektId);
    const fremd = kollegen.find((id) => !team.has(id));
    if (fremd) return { fehler: `${namen.get(fremd) ?? "Ein Kollege"} ist nicht auf dieser Baustelle eingetragen.` };
  }

  const konflikt = await ueberschneidung(supabase, d, userIds, [], namen);
  if (konflikt) return { fehler: konflikt };

  const zeile = zeitZeile(d);
  const { error } = await supabase.from("time_entries").insert(
    personen.map((p) => ({ ...zeile, id: p.eintragId, user_id: p.userId, erstellt_von: nutzer.id })),
  );
  if (error) {
    // Ging die erste Anfrage doch durch? Dann ist alles gut.
    const { data: nachher } = await supabase.from("time_entries").select("id").in("id", ids);
    if (nachher?.length !== ids.length) return { fehler: dbMeldung(error) };
  }

  aktualisieren();
  return {};
}

// ---------------------------------------------------------------------------
// Eigene Zeit ändern
// ---------------------------------------------------------------------------
export async function zeitAendern(id: string, eingabe: unknown): Promise<ZeitErgebnis> {
  const nutzer = await requireUser();
  if (!uuid.safeParse(id).success) return { fehler: "Ungültiger Eintrag." };
  const pruefung = zeitDatenSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const d = pruefung.data;

  const supabase = await createClient();
  const { data: alt } = await supabase
    .from("time_entries")
    .select("id, datum, user_id, archiviert_am")
    .eq("id", id)
    .eq("user_id", nutzer.id) // in der Mitarbeiter-Ansicht nur eigene Zeiten
    .maybeSingle();
  if (!alt) return { fehler: "Diesen Eintrag gibt es nicht (mehr)." };
  if (alt.archiviert_am) return { fehler: "Dieser Eintrag wurde gelöscht." };

  const regelAlt = await mitarbeiterRegeln(nutzer, { ...d, datum: alt.datum });
  if (regelAlt) return { fehler: regelAlt };
  const regel = await mitarbeiterRegeln(nutzer, d);
  if (regel) return { fehler: regel };

  const konflikt = await ueberschneidung(supabase, d, [nutzer.id], [id], await namenLaden(supabase, nutzer));
  if (konflikt) return { fehler: konflikt };

  const { data, error } = await supabase.from("time_entries").update(zeitZeile(d)).eq("id", id).select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Dieser Eintrag kann nicht mehr geändert werden (Sperrfrist)." };

  aktualisieren();
  return {};
}

// ---------------------------------------------------------------------------
// Eigene Zeit löschen = archivieren (nichts wird endgültig gelöscht)
// ---------------------------------------------------------------------------
export async function zeitArchivieren(id: string): Promise<ZeitErgebnis> {
  const nutzer = await requireUser();
  if (!uuid.safeParse(id).success) return { fehler: "Ungültiger Eintrag." };

  const supabase = await createClient();
  const { data: alt } = await supabase
    .from("time_entries")
    .select("id, datum, art, archiviert_am")
    .eq("id", id)
    .eq("user_id", nutzer.id)
    .maybeSingle();
  if (!alt) return { fehler: "Diesen Eintrag gibt es nicht (mehr)." };
  if (alt.archiviert_am) return {}; // schon erledigt (zweiter Versuch)

  if (!istBueroRolle(nutzer.rolle)) {
    const e = await zeiterfassungEinstellungen();
    if (!zeitNochAenderbar(alt.datum, heuteIso(), e.kulanzTage)) {
      return { fehler: `Der ${formatDatum(alt.datum)} ist schon abgeschlossen. Bitte im Büro melden.` };
    }
  }

  const { data, error } = await supabase
    .from("time_entries")
    .update({ archiviert_am: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Dieser Eintrag kann nicht mehr gelöscht werden (Sperrfrist)." };

  aktualisieren();
  return {};
}
