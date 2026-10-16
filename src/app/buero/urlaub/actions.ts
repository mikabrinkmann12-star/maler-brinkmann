"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type EntscheidungErgebnis = { fehler?: string };

const schema = z.object({
  id: z.uuid(),
  entscheidung: z.enum(["genehmigt", "abgelehnt"]),
  antwort: z.string().trim().max(500, "Die Antwort ist zu lang (höchstens 500 Zeichen).").default(""),
});

/** Nur der Admin genehmigt oder lehnt ab. Wer und wann setzt die Datenbank (Trigger). */
export async function urlaubEntscheiden(eingabe: unknown): Promise<EntscheidungErgebnis> {
  await requireRole(["admin"]);
  const pruefung = schema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { id, entscheidung, antwort } = pruefung.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status: entscheidung, antwort: antwort || null })
    .eq("id", id)
    .eq("status", "offen")
    .select("id");
  if (error) return { fehler: error.code === "P0001" ? error.message : "Speichern hat nicht geklappt." };
  if (!data.length) return { fehler: "Der Antrag ist nicht mehr offen (zurückgezogen oder schon entschieden)." };

  revalidatePath("/buero/urlaub");
  revalidatePath("/urlaub");
  return {};
}
