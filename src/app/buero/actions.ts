"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

/** Einen Hinweis (oder alle, wenn id fehlt) als gelesen markieren. */
export async function hinweiseGelesen(id?: number): Promise<void> {
  await requireRole(BUERO_ROLLEN);
  const supabase = await createClient();
  let abfrage = supabase.from("notifications").update({ gelesen_am: new Date().toISOString() }).is("gelesen_am", null);
  if (typeof id === "number") abfrage = abfrage.eq("id", id);
  await abfrage;
  revalidatePath("/buero");
}
