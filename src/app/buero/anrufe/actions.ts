"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBueroRecht } from "@/lib/auth";
import { KATEGORIEN, STATUS_WERTE, kategorieErkennen, nummerNormalisieren } from "@/lib/anruf";
import { createClient } from "@/lib/supabase/server";

// Anrufe: Büro/Admin mit dem Recht „buero_zugang“ (steht auch in den Regeln der Datenbank). Die Anrufe selbst kommen vom Webhook (/api/anrufe).

export type AnrufErgebnis = { fehler?: string };

function aktualisieren() {
  revalidatePath("/buero/anrufe");
  revalidatePath("/buero");
}

const aendernSchema = z.object({
  id: z.uuid(),
  status: z.enum(STATUS_WERTE).optional(),
  kategorie: z.enum(KATEGORIEN).optional(),
  notiz: z.string().trim().max(1000, "Die Notiz ist zu lang (höchstens 1.000 Zeichen).").optional(),
});

/** Status, Kategorie oder Notiz eines Anrufs ändern (nur was mitgeschickt wird). */
export async function anrufAendern(eingabe: unknown): Promise<AnrufErgebnis> {
  await requireBueroRecht("buero_zugang");
  const p = aendernSchema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const { id, ...felder } = p.data;
  const aenderung: { status?: string; kategorie?: string; notiz?: string | null } = {};
  if (felder.status) aenderung.status = felder.status;
  if (felder.kategorie) aenderung.kategorie = felder.kategorie;
  if (felder.notiz !== undefined) aenderung.notiz = felder.notiz || null;
  if (Object.keys(aenderung).length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.from("calls").update(aenderung).eq("id", id).select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt. Bitte nochmal versuchen." };
  aktualisieren();
  return {};
}

/** Einen Anruf aus der Liste nehmen (archivieren, nichts wird gelöscht) bzw. zurückholen. */
export async function anrufArchivieren(eingabe: unknown): Promise<AnrufErgebnis> {
  await requireBueroRecht("buero_zugang");
  const p = z.object({ id: z.uuid(), archivieren: z.boolean() }).safeParse(eingabe);
  if (!p.success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calls")
    .update({ archiviert_am: p.data.archivieren ? new Date().toISOString() : null })
    .eq("id", p.data.id)
    .select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt. Bitte nochmal versuchen." };
  aktualisieren();
  return {};
}

const eintragenSchema = z.object({
  id: z.uuid(),
  von: z.string().trim().max(40, "Die Rufnummer ist zu lang.").default(""),
  zusammenfassung: z.string().trim().min(3, "Bitte kurz aufschreiben, worum es ging.").max(4000, "Der Text ist zu lang."),
  kategorie: z.enum(KATEGORIEN).optional(),
});

/** Anruf von Hand eintragen (z. B. verpasster Anruf oder Anruf auf dem Handy). Die ID kommt vom Formular, ein zweites Senden legt nichts doppelt an. */
export async function anrufEintragen(eingabe: unknown): Promise<AnrufErgebnis> {
  const nutzer = await requireBueroRecht("buero_zugang");
  const p = eintragenSchema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const supabase = await createClient();
  const { error } = await supabase.from("calls").insert({
    id: p.data.id,
    anbieter: "manuell",
    richtung: "eingehend",
    von_nummer: nummerNormalisieren(p.data.von) ? p.data.von : null,
    zusammenfassung: p.data.zusammenfassung,
    kategorie: p.data.kategorie ?? kategorieErkennen(p.data.zusammenfassung),
    erstellt_von: nutzer.id,
  });
  if (error && error.code !== "23505") return { fehler: "Der Anruf konnte nicht eingetragen werden. Bitte nochmal versuchen." };
  aktualisieren();
  return {};
}
