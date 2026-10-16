"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { angebotBerechnen } from "@/lib/angebot";
import { angebotLaden } from "@/lib/angebot-daten";
import { MAX_ANWEISUNG, arbeitsanweisungErzeugen } from "@/lib/arbeitsanweisung";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

// Arbeitsanweisungen (Büro und Admin). Mitarbeiter sehen sie erst nach der Freigabe (Regel steht in der Datenbank).

export type AnweisungErgebnis = { fehler?: string; id?: string; projektId?: string };

const uuid = z.uuid();

function meldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "23505") return "Zu diesem Angebot gibt es schon eine Arbeitsanweisung.";
  if (fehler.code === "23514") return "Ein Wert ist ungültig (zu lang).";
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

function aktualisieren(projektId: string) {
  revalidatePath(`/baustellen/${projektId}`);
}

/**
 * Aus den Positionen eines Angebots eine Arbeitsanweisung ohne Preise erzeugen. Gibt es für das Angebot schon eine,
 * die noch nicht freigegeben ist, wird sie neu erzeugt (überschrieben). Eine freigegebene bleibt unangetastet.
 */
export async function arbeitsanweisungErstellen(angebotId: string): Promise<AnweisungErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  const detail = await angebotLaden(angebotId);
  if (!detail) return { fehler: "Angebot nicht gefunden." };
  const { angebot: a, bausteine, projekt } = detail;

  const rechnung = angebotBerechnen(bausteine, { rabattProzent: a.rabattProzent, steuersatz: a.steuersatz, reverseCharge: a.reverseCharge });
  const { titel, inhalt } = arbeitsanweisungErzeugen({ betreff: a.betreff, adresse: a.leistungsort || projekt.adresse, zeilen: rechnung.zeilen });
  if (!inhalt.trim()) return { fehler: "Das Angebot hat keine Positionen, aus denen eine Arbeitsanweisung entstehen könnte." };

  const supabase = await createClient();
  const { data: vorhanden } = await supabase
    .from("work_instructions")
    .select("id, freigegeben_am")
    .eq("quote_id", angebotId)
    .is("archiviert_am", null)
    .maybeSingle();

  if (vorhanden) {
    if (vorhanden.freigegeben_am) return { fehler: "Es gibt schon eine freigegebene Arbeitsanweisung. Nimm die Freigabe zurück oder archiviere sie, dann kannst du eine neue erzeugen.", projektId: projekt.id };
    const { error } = await supabase.from("work_instructions").update({ titel, inhalt }).eq("id", vorhanden.id);
    if (error) return { fehler: meldung(error) };
    aktualisieren(projekt.id);
    return { id: vorhanden.id, projektId: projekt.id };
  }

  const { data, error } = await supabase
    .from("work_instructions")
    .insert({ project_id: projekt.id, quote_id: angebotId, titel, inhalt })
    .select("id")
    .single();
  if (error) return { fehler: meldung(error) };
  aktualisieren(projekt.id);
  return { id: data.id, projektId: projekt.id };
}

async function projektIdVon(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("work_instructions").select("project_id").eq("id", id).maybeSingle();
  return data?.project_id ?? null;
}

export async function anweisungSpeichern(id: string, titel: string, inhalt: string): Promise<AnweisungErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Anweisung." };
  const t = titel.trim();
  if (!t) return { fehler: "Bitte einen Titel eingeben." };
  if (t.length > 200) return { fehler: "Der Titel ist zu lang (höchstens 200 Zeichen)." };
  if (inhalt.length > MAX_ANWEISUNG) return { fehler: `Der Text ist zu lang (höchstens ${MAX_ANWEISUNG} Zeichen).` };
  if (!inhalt.trim()) return { fehler: "Bitte den Text der Arbeitsanweisung eingeben." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("work_instructions").update({ titel: t, inhalt: inhalt.replace(/\r/g, "") }).eq("id", id).select("project_id");
  if (error) return { fehler: meldung(error) };
  if (!data?.length) return { fehler: "Arbeitsanweisung nicht gefunden." };
  aktualisieren(data[0].project_id);
  return { id, projektId: data[0].project_id };
}

/** Für die Mitarbeiter des Projekts freigeben oder die Freigabe zurücknehmen. */
export async function anweisungFreigeben(id: string, freigeben: boolean): Promise<AnweisungErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Anweisung." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_instructions")
    .update({ freigegeben_am: freigeben ? new Date().toISOString() : null })
    .eq("id", id)
    .select("project_id");
  if (error) return { fehler: meldung(error) };
  if (!data?.length) return { fehler: "Arbeitsanweisung nicht gefunden." };
  aktualisieren(data[0].project_id);
  return { id, projektId: data[0].project_id };
}

export async function anweisungArchivieren(id: string): Promise<AnweisungErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültige Anweisung." };
  const projektId = await projektIdVon(id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_instructions")
    .update({ archiviert_am: new Date().toISOString(), freigegeben_am: null })
    .eq("id", id)
    .select("id");
  if (error) return { fehler: meldung(error) };
  if (!data?.length || !projektId) return { fehler: "Arbeitsanweisung nicht gefunden." };
  aktualisieren(projektId);
  return { id, projektId };
}
