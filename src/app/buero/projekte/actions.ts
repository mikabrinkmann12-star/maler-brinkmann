"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { projektnummerVorschlag } from "@/lib/projektnummer-daten";
import { projektSchema } from "@/lib/projekt-schema";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";

export type ProjektErgebnis = { fehler?: string; id?: string };

/** Projekt anlegen (id leer) oder ändern. Büro und Admin. */
export async function projektSpeichern(id: string | null, eingabe: unknown): Promise<ProjektErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (id !== null && !z.uuid().safeParse(id).success) return { fehler: "Ungültiges Projekt." };
  const pruefung = projektSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const p = pruefung.data;

  const supabase = await createClient();
  const felder = {
    projektnummer: p.projektnummer,
    name: p.name,
    contact_id: p.contactId,
    status_id: p.statusId,
    baustelle_strasse: p.strasse || null,
    baustelle_plz: p.plz || null,
    baustelle_ort: p.ort || null,
    start_datum: p.startDatum || null,
    end_datum: p.endDatum || null,
    beschreibung: p.beschreibung || null,
    buero_ansprechpartner_id: p.bueroAnsprechpartnerId,
  };
  const abfrage = id ? supabase.from("projects").update(felder).eq("id", id) : supabase.from("projects").insert(felder);
  const { data, error } = await abfrage.select("id");
  if (error) {
    return {
      fehler: error.code === "23505"
        ? "Diese Projektnummer gibt es schon. Tippe auf „Neu vorschlagen“."
        : "Speichern hat nicht geklappt. Bitte nochmal versuchen.",
    };
  }
  if (!data?.length) return { fehler: "Projekt nicht gefunden." };

  revalidatePath("/buero/projekte");
  revalidatePath(`/baustellen/${data[0].id}`);
  return { id: data[0].id };
}

export async function projektnummerVorschlagen(): Promise<{ nummer?: string; fehler?: string }> {
  await requireRole(BUERO_ROLLEN);
  try {
    return { nummer: await projektnummerVorschlag() };
  } catch {
    return { fehler: "Der Vorschlag konnte nicht berechnet werden." };
  }
}

export type KundeTreffer = { id: string; name: string; kundennummer: string; strasse: string; plz: string; ort: string };

/** Kunden für die Auswahl im Projektformular suchen (höchstens 12 Treffer, nur nicht archivierte). */
export async function kundenFinden(suche: string): Promise<KundeTreffer[]> {
  await requireRole(BUERO_ROLLEN);
  const q = suchtext(suche);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const felder = ["firmenname", "vorname", "nachname", "kundennummer", "ort", "strasse"];
  const { data } = await supabase
    .from("contacts")
    .select("id, firmenname, vorname, nachname, kundennummer, strasse, plz, ort")
    .is("archiviert_am", null)
    .or(felder.map((f) => `${f}.ilike.%${q}%`).join(","))
    .limit(12);
  return (data ?? []).map((k) => ({
    id: k.id,
    name: k.firmenname || [k.vorname, k.nachname].filter(Boolean).join(" ") || "Ohne Namen",
    kundennummer: k.kundennummer ?? "",
    strasse: k.strasse ?? "",
    plz: k.plz ?? "",
    ort: k.ort ?? "",
  }));
}
