"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBueroRecht } from "@/lib/auth";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { projektnummerVorschlag } from "@/lib/projektnummer-daten";
import { projektSchema } from "@/lib/projekt-schema";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";

export type ProjektErgebnis = { fehler?: string; id?: string };

/** Projekt anlegen (id leer) oder ändern. Büro und Admin. Ohne Projektnummer vergibt die App die nächste. */
export async function projektSpeichern(id: string | null, eingabe: unknown): Promise<ProjektErgebnis> {
  const nutzer = await requireBueroRecht("projekte_bearbeiten");
  if (id !== null && !z.uuid().safeParse(id).success) return { fehler: "Ungültiges Projekt." };
  const pruefung = projektSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const p = pruefung.data;
  if (id !== null && !p.projektnummer) return { fehler: "Bitte eine Projektnummer eingeben." };

  const supabase = await createClient();
  const felder = (nummer: string) => ({
    projektnummer: nummer,
    name: p.name,
    contact_id: p.contactId,
    status_id: p.statusId,
    baustelle_strasse: p.strasse || null,
    baustelle_plz: p.plz || null,
    baustelle_ort: p.ort || null,
    land: p.land,
    start_datum: p.startDatum || null,
    end_datum: p.endDatum || null,
    beschreibung: p.beschreibung || null,
    buero_ansprechpartner_id: p.bueroAnsprechpartnerId,
  });

  let gespeichert: { id: string } | null = null;
  // Bei automatischer Nummer: kollidiert sie gerade mit einem anderen Anlegen, nochmal mit der nächsten versuchen
  for (let versuch = 0; versuch < 3 && !gespeichert; versuch++) {
    const nummer = p.projektnummer || (await projektnummerVorschlag());
    const abfrage = id ? supabase.from("projects").update(felder(nummer)).eq("id", id) : supabase.from("projects").insert(felder(nummer));
    const { data, error } = await abfrage.select("id");
    if (error) {
      if (error.code === "23505" && !p.projektnummer) continue;
      return {
        fehler: error.code === "23505"
          ? "Diese Projektnummer gibt es schon. Bitte eine andere eingeben oder das Feld leer lassen."
          : "Speichern hat nicht geklappt. Bitte nochmal versuchen.",
      };
    }
    if (!data?.length) return { fehler: "Projekt nicht gefunden." };
    gespeichert = data[0];
  }
  if (!gespeichert) return { fehler: "Es konnte keine freie Projektnummer vergeben werden. Bitte nochmal versuchen." };

  // Mitarbeiter: Liste genau auf die Auswahl setzen
  const gewollt = new Set(p.mitarbeiterIds);
  const { data: vorhanden } = await supabase.from("project_members").select("user_id").eq("project_id", gespeichert.id);
  const bisher = new Set((vorhanden ?? []).map((m) => m.user_id));
  const neu = [...gewollt].filter((u) => !bisher.has(u));
  const weg = [...bisher].filter((u) => !gewollt.has(u));
  if (neu.length) {
    const { error } = await supabase.from("project_members").insert(neu.map((user_id) => ({ project_id: gespeichert!.id, user_id, added_by: nutzer.id })));
    if (error) return { fehler: "Das Projekt ist gespeichert, aber nicht alle Mitarbeiter konnten eingetragen werden.", id: gespeichert.id };
  }
  if (weg.length) await supabase.from("project_members").delete().eq("project_id", gespeichert.id).in("user_id", weg);

  revalidatePath("/buero/projekte");
  revalidatePath(`/baustellen/${gespeichert.id}`);
  revalidatePath(`/buero/projekte/${gespeichert.id}`);
  return { id: gespeichert.id };
}

export async function projektnummerVorschlagen(): Promise<{ nummer?: string; fehler?: string }> {
  await requireBueroRecht("projekte_bearbeiten");
  try {
    return { nummer: await projektnummerVorschlag() };
  } catch {
    return { fehler: "Der Vorschlag konnte nicht berechnet werden." };
  }
}

export type KundeTreffer = { id: string; name: string; kundennummer: string; strasse: string; plz: string; ort: string; land: string };

/** Kunden für die Auswahl im Projektformular suchen (höchstens 12 Treffer, nur nicht archivierte). */
export async function kundenFinden(suche: string): Promise<KundeTreffer[]> {
  await requireBueroRecht("projekte_bearbeiten");
  const q = suchtext(suche);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const felder = ["firmenname", "vorname", "nachname", "kundennummer", "ort", "strasse"];
  const { data } = await supabase
    .from("contacts")
    .select("id, firmenname, vorname, nachname, kundennummer, strasse, plz, ort, land")
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
    land: k.land ?? "Deutschland",
  }));
}

/** Status eines Projekts direkt in der Liste ändern (wie in Plancraft: Status-Pille antippen). Büro und Admin. */
export async function projektStatusAendern(projektId: string, statusId: string): Promise<{ fehler?: string }> {
  await requireBueroRecht("projekte_bearbeiten");
  if (!z.uuid().safeParse(projektId).success || !z.uuid().safeParse(statusId).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").update({ status_id: statusId }).eq("id", projektId).select("id");
  if (error || !data?.length) return { fehler: "Der Status konnte nicht geändert werden." };
  revalidatePath("/buero/projekte");
  revalidatePath("/buero");
  revalidatePath(`/baustellen/${projektId}`);
  revalidatePath(`/buero/projekte/${projektId}`);
  return {};
}
