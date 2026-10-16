"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { istKatalogArt, type KatalogArt } from "@/lib/katalog";
import { leistungSchema, materialSchema, ordnerSchema } from "@/lib/katalog-schema";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

// Katalog pflegen (Büro und Admin). Nichts wird gelöscht, nur archiviert.
// Verbindlich regelt die Datenbank die Rechte (RLS) und die Ordner-Regeln (Trigger).

export type KatalogErgebnis = { fehler?: string; id?: string };

const uuid = z.uuid();

function aktualisieren() {
  revalidatePath("/buero/katalog", "layout");
}

function dbMeldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "P0001") return fehler.message; // Meldungen der Trigger sind schon deutsch
  if (fehler.code === "23505") return "Diesen Namen gibt es in diesem Ordner schon.";
  if (fehler.code === "23514") return "Ein Wert ist ungültig (zu lang oder außerhalb des erlaubten Bereichs).";
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

function tabelle(art: KatalogArt) {
  return art === "material" ? "materials" : "services";
}

// ---------------------------------------------------------------------------
// Ordner
// ---------------------------------------------------------------------------
export async function ordnerSpeichern(art: string, id: string | null, eingabe: unknown): Promise<KatalogErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!istKatalogArt(art)) return { fehler: "Ungültige Art." };
  if (id !== null && !uuid.safeParse(id).success) return { fehler: "Ungültiger Ordner." };
  const pruefung = ordnerSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const o = pruefung.data;

  const supabase = await createClient();
  if (o.parentId) {
    const { data: eltern } = await supabase.from("catalog_folders").select("archiviert_am").eq("id", o.parentId).maybeSingle();
    if (!eltern) return { fehler: "Der übergeordnete Ordner existiert nicht." };
    if (eltern.archiviert_am) return { fehler: "Der übergeordnete Ordner ist archiviert." };
  }

  const abfrage = id
    ? supabase.from("catalog_folders").update({ name: o.name, parent_id: o.parentId }).eq("id", id)
    : supabase.from("catalog_folders").insert({ art, name: o.name, parent_id: o.parentId });
  const { data, error } = await abfrage.select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Ordner nicht gefunden." };

  aktualisieren();
  return { id: data[0].id };
}

/** Ordner archivieren (nur wenn er leer ist) oder wiederherstellen (nur wenn der übergeordnete Ordner aktiv ist). */
export async function ordnerArchivieren(art: string, id: string, archivieren: boolean): Promise<KatalogErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!istKatalogArt(art) || !uuid.safeParse(id).success) return { fehler: "Ungültiger Ordner." };
  const supabase = await createClient();

  const { data: ordner } = await supabase.from("catalog_folders").select("parent_id").eq("id", id).maybeSingle();
  if (!ordner) return { fehler: "Ordner nicht gefunden." };

  if (archivieren) {
    const [unter, eintraege] = await Promise.all([
      supabase.from("catalog_folders").select("id", { count: "exact", head: true }).eq("parent_id", id).is("archiviert_am", null),
      supabase.from(tabelle(art)).select("id", { count: "exact", head: true }).eq("folder_id", id).is("archiviert_am", null),
    ]);
    if (unter.error || eintraege.error) return { fehler: "Das hat nicht geklappt." };
    if ((unter.count ?? 0) > 0 || (eintraege.count ?? 0) > 0) {
      return { fehler: "Der Ordner ist nicht leer. Bitte zuerst die Einträge und Unterordner verschieben oder archivieren." };
    }
  } else if (ordner.parent_id) {
    const { data: eltern } = await supabase.from("catalog_folders").select("archiviert_am").eq("id", ordner.parent_id).maybeSingle();
    if (eltern?.archiviert_am) return { fehler: "Der übergeordnete Ordner ist archiviert. Bitte zuerst den wiederherstellen." };
  }

  const { data, error } = await supabase
    .from("catalog_folders")
    .update({ archiviert_am: archivieren ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Ordner nicht gefunden." };

  aktualisieren();
  return {};
}

// ---------------------------------------------------------------------------
// Materialien und Leistungen
// ---------------------------------------------------------------------------
export async function eintragSpeichern(art: string, id: string | null, eingabe: unknown): Promise<KatalogErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!istKatalogArt(art)) return { fehler: "Ungültige Art." };
  if (id !== null && !uuid.safeParse(id).success) return { fehler: "Ungültiger Eintrag." };

  const supabase = await createClient();

  // Ordner prüfen (existiert, nicht archiviert); die Datenbank prüft zusätzlich, ob er zur Art passt
  const pruefeOrdner = async (folderId: string | null): Promise<string | null> => {
    if (!folderId) return null;
    const { data } = await supabase.from("catalog_folders").select("archiviert_am").eq("id", folderId).maybeSingle();
    if (!data) return "Der Ordner existiert nicht.";
    if (data.archiviert_am) return "Der Ordner ist archiviert.";
    return null;
  };

  if (art === "material") {
    const pruefung = materialSchema.safeParse(eingabe);
    if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
    const m = pruefung.data;
    const ordnerFehler = await pruefeOrdner(m.folderId);
    if (ordnerFehler) return { fehler: ordnerFehler };
    const felder = {
      folder_id: m.folderId,
      artikelnr: m.artikelnr || null,
      name: m.name,
      beschreibung: m.beschreibung || null,
      lieferant: m.lieferant || null,
      einheit: m.einheit,
      ek: m.ek,
      zuschlag_prozent: m.zuschlag,
    };
    const abfrage = id ? supabase.from("materials").update(felder).eq("id", id) : supabase.from("materials").insert(felder);
    const { data, error } = await abfrage.select("id");
    if (error) return { fehler: dbMeldung(error) };
    if (!data?.length) return { fehler: "Eintrag nicht gefunden." };
    aktualisieren();
    return { id: data[0].id };
  }

  const pruefung = leistungSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const l = pruefung.data;
  const ordnerFehler = await pruefeOrdner(l.folderId);
  if (ordnerFehler) return { fehler: ordnerFehler };
  const felder = {
    folder_id: l.folderId,
    nummer: l.nummer || null,
    name: l.name,
    langtext: l.langtext || null,
    einheit: l.einheit,
    kosten: l.kosten,
    zuschlag_prozent: l.zuschlag,
  };
  const abfrage = id ? supabase.from("services").update(felder).eq("id", id) : supabase.from("services").insert(felder);
  const { data, error } = await abfrage.select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Eintrag nicht gefunden." };
  aktualisieren();
  return { id: data[0].id };
}

/** Eintrag archivieren oder wiederherstellen (dann muss sein Ordner aktiv sein). */
export async function eintragArchivieren(art: string, id: string, archivieren: boolean): Promise<KatalogErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!istKatalogArt(art) || !uuid.safeParse(id).success) return { fehler: "Ungültiger Eintrag." };
  const supabase = await createClient();

  if (!archivieren) {
    const { data: eintrag } = await supabase.from(tabelle(art)).select("folder_id").eq("id", id).maybeSingle();
    if (eintrag?.folder_id) {
      const { data: ordner } = await supabase.from("catalog_folders").select("archiviert_am").eq("id", eintrag.folder_id).maybeSingle();
      if (ordner?.archiviert_am) return { fehler: "Der Ordner dieses Eintrags ist archiviert. Bitte zuerst den Ordner wiederherstellen." };
    }
  }

  const { data, error } = await supabase
    .from(tabelle(art))
    .update({ archiviert_am: archivieren ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Eintrag nicht gefunden." };

  aktualisieren();
  return {};
}
