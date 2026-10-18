"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { createClient } from "@/lib/supabase/server";

// Projektstatus verwalten (nur Admin; die Datenbank erlaubt das Ändern ebenfalls nur dem Admin). Gelöscht wird nichts, nur ausgeblendet.

export type StatusErgebnis = { fehler?: string };

const uuid = z.uuid();
const statusSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen eingeben.").max(60, "Der Name ist zu lang (höchstens 60 Zeichen)."),
  farbe: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Ungültige Farbe."),
});

function aktualisieren() {
  revalidatePath("/buero", "layout");
  revalidatePath("/baustellen", "layout");
}

function dbMeldung(fehler: { code?: string }): string {
  if (fehler.code === "23505") return "Diesen Status gibt es schon.";
  return "Das hat nicht geklappt. Bitte nochmal versuchen.";
}

export async function statusAnlegen(eingabe: unknown): Promise<StatusErgebnis> {
  await requireRole(["admin"]);
  const p = statusSchema.safeParse(eingabe);
  if (!p.success) return { fehler: ersteMeldung(p.error) };
  const supabase = await createClient();
  const { data: letzter } = await supabase.from("project_statuses").select("sortierung").order("sortierung", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("project_statuses").insert({ name: p.data.name, farbe: p.data.farbe, sortierung: (letzter?.sortierung ?? 0) + 10 });
  if (error) return { fehler: dbMeldung(error) };
  aktualisieren();
  return {};
}

export async function statusAendern(id: string, eingabe: unknown): Promise<StatusErgebnis> {
  await requireRole(["admin"]);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültiger Status." };
  const p = statusSchema.extend({ aktiv: z.boolean() }).safeParse(eingabe);
  if (!p.success) return { fehler: ersteMeldung(p.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_statuses").update({ name: p.data.name, farbe: p.data.farbe, aktiv: p.data.aktiv }).eq("id", id).select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Status nicht gefunden." };
  aktualisieren();
  return {};
}

/** Status um eine Stelle verschieben: tauscht die Reihenfolge mit dem Nachbarn. */
export async function statusVerschieben(id: string, richtung: "hoch" | "runter"): Promise<StatusErgebnis> {
  await requireRole(["admin"]);
  if (!uuid.safeParse(id).success || (richtung !== "hoch" && richtung !== "runter")) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data: alle, error } = await supabase.from("project_statuses").select("id, sortierung").order("sortierung").order("name");
  if (error || !alle) return { fehler: "Das hat nicht geklappt. Bitte nochmal versuchen." };
  const i = alle.findIndex((s) => s.id === id);
  const j = richtung === "hoch" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= alle.length) return {};
  // Neu durchnummerieren, damit auch gleiche Zahlen sauber getauscht werden
  const reihenfolge = alle.map((s) => s.id);
  [reihenfolge[i], reihenfolge[j]] = [reihenfolge[j], reihenfolge[i]];
  for (let n = 0; n < reihenfolge.length; n++) {
    const { error: e } = await supabase.from("project_statuses").update({ sortierung: (n + 1) * 10 }).eq("id", reihenfolge[n]);
    if (e) return { fehler: dbMeldung(e) };
  }
  aktualisieren();
  return {};
}
