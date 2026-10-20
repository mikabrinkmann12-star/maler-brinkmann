"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBueroRecht } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatDatum } from "@/lib/format";
import { ruecknahmePlan } from "@/lib/urlaub";
import { createClient } from "@/lib/supabase/server";

export type EntscheidungErgebnis = { fehler?: string };

const schema = z.object({
  id: z.uuid(),
  entscheidung: z.enum(["genehmigt", "abgelehnt"]),
  antwort: z.string().trim().max(500, "Die Antwort ist zu lang (höchstens 500 Zeichen).").default(""),
});

/** Nur der Admin genehmigt oder lehnt ab. Wer und wann setzt die Datenbank (Trigger). */
export async function urlaubEntscheiden(eingabe: unknown): Promise<EntscheidungErgebnis> {
  await requireBueroRecht("urlaub_genehmigen");
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

const ruecknahmeSchema = z.object({
  id: z.uuid(),
  umfang: z.enum(["ganz", "rest"]),
  grund: z.string().trim().max(300, "Der Grund ist zu lang (höchstens 300 Zeichen).").default(""),
});

/**
 * Genehmigten Urlaub bzw. genehmigtes Abfeiern zurücknehmen (nur Admin), auch wenn es schon läuft.
 * „ganz“: Antrag wird zurückgezogen, alle gebuchten Tage fallen weg (der Trigger archiviert die Zeiten).
 * „rest“: nur ab heute; der Antrag endet gestern, vergangene Tage bleiben gebucht. Die Zeiten werden archiviert, nie gelöscht.
 */
export async function urlaubZuruecknehmen(eingabe: unknown): Promise<EntscheidungErgebnis> {
  await requireBueroRecht("urlaub_genehmigen");
  const pruefung = ruecknahmeSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { id, umfang, grund } = pruefung.data;

  const supabase = await createClient();
  const { data: antrag } = await supabase.from("leave_requests").select("id, von, bis, status, antwort").eq("id", id).maybeSingle();
  if (!antrag) return { fehler: "Antrag nicht gefunden." };
  if (antrag.status !== "genehmigt") return { fehler: "Nur genehmigte Anträge lassen sich zurücknehmen." };

  const heute = heuteIso();
  const plan = ruecknahmePlan(antrag, heute, umfang);
  if ("fehler" in plan) return { fehler: plan.fehler };

  const notiz = `Zurückgenommen${plan.art === "rest" ? ` ab ${formatDatum(heute)}` : ""} am ${formatDatum(heute)}${grund ? `: ${grund}` : ""}`;
  const antwort = [antrag.antwort, notiz].filter(Boolean).join(" · ");

  if (plan.art === "ganz") {
    // Status verlassen: der Trigger archiviert alle gebuchten Zeiten
    const { error } = await supabase.from("leave_requests").update({ status: "zurueckgezogen", antwort }).eq("id", id).eq("status", "genehmigt");
    if (error) return { fehler: "Zurücknehmen hat nicht geklappt. Bitte nochmal versuchen." };
  } else {
    // Erst den Zeitraum kürzen, dann die Zeiten ab heute archivieren; schlägt Letzteres fehl, wird gekürzt zurückgesetzt
    const { error } = await supabase.from("leave_requests").update({ bis: plan.neuesBis, antwort }).eq("id", id).eq("status", "genehmigt");
    if (error) return { fehler: "Zurücknehmen hat nicht geklappt. Bitte nochmal versuchen." };
    const { error: zeitFehler } = await supabase
      .from("time_entries")
      .update({ archiviert_am: new Date().toISOString() })
      .eq("leave_request_id", id)
      .gte("datum", heute)
      .is("archiviert_am", null);
    if (zeitFehler) {
      await supabase.from("leave_requests").update({ bis: antrag.bis, antwort: antrag.antwort }).eq("id", id);
      return { fehler: "Die Zeiten ab heute ließen sich nicht entfernen. Es wurde nichts geändert." };
    }
  }

  revalidatePath("/buero/urlaub");
  revalidatePath("/buero/zeiten", "layout");
  revalidatePath("/urlaub");
  revalidatePath("/zeiten", "layout");
  return {};
}
