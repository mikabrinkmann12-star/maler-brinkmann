"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireUser } from "@/lib/auth";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

export type TeamErgebnis = { fehler?: string };
const id = z.uuid();

/** Kernfeature: Kollegen zu einer eigenen Baustelle hinzufügen (RLS prüft „eigene“). */
export async function kollegeHinzufuegen(projektId: string, userId: string): Promise<TeamErgebnis> {
  const nutzer = await requireUser();
  if (!id.safeParse(projektId).success || !id.safeParse(userId).success) return { fehler: "Ungültige Eingabe." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .insert({ project_id: projektId, user_id: userId, added_by: nutzer.id });
  if (error) {
    return {
      fehler: error.code === "23505"
        ? "Ist schon auf der Baustelle."
        : "Hinzufügen geht nur auf Baustellen, auf denen du selbst eingetragen bist.",
    };
  }
  revalidatePath(`/baustellen/${projektId}`);
  return {};
}

/** Zuordnung wieder entfernen – nur Büro/Admin. */
export async function kollegeEntfernen(projektId: string, userId: string): Promise<TeamErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!id.safeParse(projektId).success || !id.safeParse(userId).success) return { fehler: "Ungültige Eingabe." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projektId)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { fehler: "Entfernen hat nicht geklappt." };
  revalidatePath(`/baustellen/${projektId}`);
  return {};
}
