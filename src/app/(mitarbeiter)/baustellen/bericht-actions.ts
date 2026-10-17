"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { berichtAbschliessenSchema, berichtSpeichernSchema, unterschriftPfad } from "@/lib/bericht";
import { createClient } from "@/lib/supabase/server";

// Berichte (Bautagesbericht …). Verbindlich regelt die Datenbank (RLS + Trigger): Büro/Admin und Mitglieder schreiben,
// Entwürfe ändert der Ersteller (oder das Büro), abgeschlossene Berichte sind unveränderlich.

export type BerichtErgebnis = { fehler?: string };

const FEHLER_RECHTE = "Das hat nicht geklappt. Berichte gehen nur auf aktiven Baustellen, auf denen du eingetragen bist.";

/** Entwurf speichern (anlegen oder ändern). Die ID erzeugt die App: erneutes Senden speichert nichts doppelt. */
export async function berichtSpeichern(eingabe: unknown): Promise<BerichtErgebnis> {
  const nutzer = await requireUser();
  const pruefung = berichtSpeichernSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const b = pruefung.data;
  const supabase = await createClient();

  // Personal und Fotos müssen zu dieser Baustelle gehören
  const personal = [...new Set(b.daten.personal)];
  if (personal.length) {
    const { data } = await supabase.from("project_members").select("user_id").eq("project_id", b.projektId).in("user_id", personal);
    if ((data?.length ?? 0) !== personal.length) return { fehler: "Es können nur Mitarbeiter dieser Baustelle als anwesend eingetragen werden." };
  }
  const fotos = [...new Set(b.daten.fotos)];
  if (fotos.length) {
    const { data } = await supabase.from("project_photos").select("id").eq("project_id", b.projektId).is("archiviert_am", null).in("id", fotos);
    if ((data?.length ?? 0) !== fotos.length) return { fehler: "Eines der Fotos gehört nicht zu dieser Baustelle." };
  }
  const daten = { ...b.daten, personal, fotos };

  const { data: vorhanden } = await supabase.from("project_reports").select("id, status, project_id").eq("id", b.id).maybeSingle();
  if (vorhanden) {
    if (vorhanden.project_id !== b.projektId) return { fehler: "Ungültige Eingabe." };
    if (vorhanden.status === "abgeschlossen") return { fehler: "Dieser Bericht ist schon abgeschlossen und kann nicht mehr geändert werden." };
    const { data, error } = await supabase.from("project_reports").update({ datum: b.datum, daten }).eq("id", b.id).select("id");
    if (error || !data?.length) return { fehler: "Das hat nicht geklappt. Du kannst nur deine eigenen Entwürfe ändern." };
  } else {
    const { error } = await supabase
      .from("project_reports")
      .insert({ id: b.id, project_id: b.projektId, art: b.art, datum: b.datum, daten, erstellt_von: nutzer.id });
    if (error && error.code !== "23505") return { fehler: FEHLER_RECHTE };
  }
  revalidatePath(`/baustellen/${b.projektId}/berichte`);
  return {};
}

/** Bericht abschließen, optional mit Unterschrift (das Bild liegt vorher schon im Speicher). Danach ist er unveränderlich. */
export async function berichtAbschliessen(eingabe: unknown): Promise<BerichtErgebnis> {
  await requireUser();
  const pruefung = berichtAbschliessenSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { id, projektId, unterschrift } = pruefung.data;
  const supabase = await createClient();

  const { data: bericht } = await supabase.from("project_reports").select("status, project_id").eq("id", id).maybeSingle();
  if (!bericht || bericht.project_id !== projektId) return { fehler: "Diesen Bericht gibt es nicht." };
  if (bericht.status === "abgeschlossen") return {}; // schon erledigt (erneutes Senden)

  const teile: { status: "abgeschlossen"; unterschrift_name?: string; unterschrift_pfad?: string; unterschrieben_am?: string } = { status: "abgeschlossen" };
  if (unterschrift) {
    const datei = `${id}.png`;
    const { data: dateien } = await supabase.storage.from("berichtunterschriften").list(projektId, { search: datei });
    if (!dateien?.some((d) => d.name === datei)) return { fehler: "Die Unterschrift ist nicht angekommen. Bitte nochmal versuchen." };
    teile.unterschrift_name = unterschrift.name;
    teile.unterschrift_pfad = unterschriftPfad(projektId, id);
    teile.unterschrieben_am = new Date().toISOString();
  }
  const { data, error } = await supabase.from("project_reports").update(teile).eq("id", id).select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt. Du kannst nur deine eigenen Entwürfe abschließen." };
  revalidatePath(`/baustellen/${projektId}/berichte`);
  return {};
}

/** Bericht entfernen (archivieren): Entwürfe der Ersteller, abgeschlossene nur das Büro (Datenbank prüft). */
export async function berichtArchivieren(id: string, projektId: string): Promise<BerichtErgebnis> {
  await requireUser();
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(projektId).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_reports")
    .update({ archiviert_am: new Date().toISOString() })
    .eq("id", id)
    .eq("project_id", projektId)
    .select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt. Abgeschlossene Berichte kann nur das Büro entfernen." };
  revalidatePath(`/baustellen/${projektId}/berichte`);
  return {};
}
