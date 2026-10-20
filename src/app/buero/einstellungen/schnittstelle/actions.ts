"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { istScope, schluesselErzeugen } from "@/lib/api-schluessel";
import { createClient } from "@/lib/supabase/server";

// API-Schlüssel anlegen und widerrufen: nur Admin (RLS prüft es zusätzlich). Der Klartext des Schlüssels wird nur hier zurückgegeben,
// gespeichert wird nur der Hash.

export type SchluesselErgebnis = { fehler?: string; klartext?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen eingeben (z. B. „Jarvis“).").max(80, "Der Name ist zu lang (höchstens 80 Zeichen)."),
  scopes: z.array(z.string()).min(1, "Bitte mindestens ein Recht wählen.").refine((s) => s.every(istScope), "Unbekanntes Recht."),
});

export async function apiSchluesselAnlegen(eingabe: unknown): Promise<SchluesselErgebnis> {
  const admin = await requireRole(["admin"]);
  const p = schema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const s = schluesselErzeugen();
  const supabase = await createClient();
  const { error } = await supabase.from("api_keys").insert({ name: p.data.name, key_hash: s.hash, prefix: s.prefix, scopes: p.data.scopes, created_by: admin.id });
  if (error) return { fehler: "Der Schlüssel konnte nicht angelegt werden." };
  revalidatePath("/buero/einstellungen/schnittstelle");
  return { klartext: s.klartext };
}

export async function apiSchluesselWiderrufen(id: string): Promise<SchluesselErgebnis> {
  await requireRole(["admin"]);
  if (!z.uuid().safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null).select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt." };
  revalidatePath("/buero/einstellungen/schnittstelle");
  return {};
}
