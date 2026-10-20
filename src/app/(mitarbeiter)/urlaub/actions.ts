"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRecht } from "@/lib/auth";
import { heuteIso, istIsoDatum } from "@/lib/datum";
import { formatDatum, formatStunden, formatStundenSaldo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { abbauPruefen, sollSumme } from "@/lib/ueberstunden";
import { kontenLaden } from "@/lib/ueberstunden-daten";
import { URLAUB_ARTEN } from "@/lib/urlaub";

// Urlaub beantragen und zurückziehen (eigene Anträge). Entscheiden darf nur
// der Admin (src/app/buero/urlaub/actions.ts). Idempotent wie alle Aktionen,
// die über die Warteschlange laufen.

export type UrlaubErgebnis = { fehler?: string };

const datum = z.string().refine(istIsoDatum, "Bitte ein gültiges Datum wählen.");
const antragSchema = z
  .object({
    id: z.uuid(),
    von: datum,
    bis: datum,
    art: z.enum(URLAUB_ARTEN, { error: "Bitte die Art wählen." }),
    bemerkung: z.string().trim().max(500, "Die Bemerkung ist zu lang (höchstens 500 Zeichen).").default(""),
  })
  .refine((a) => a.bis >= a.von, "Das Ende darf nicht vor dem Beginn liegen.");

function aktualisieren() {
  revalidatePath("/urlaub");
  revalidatePath("/buero/urlaub");
  revalidatePath("/buero");
}

export async function urlaubBeantragen(eingabe: unknown): Promise<UrlaubErgebnis> {
  const nutzer = await requireRecht("urlaub_beantragen");
  const pruefung = antragSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: pruefung.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const a = pruefung.data;

  const supabase = await createClient();
  const { data: schon } = await supabase.from("leave_requests").select("id").eq("id", a.id).maybeSingle();
  if (schon) return {}; // zweiter Versuch nach Funkloch

  // Überschneidung mit eigenen offenen oder genehmigten Anträgen?
  const { data: andere } = await supabase
    .from("leave_requests")
    .select("von, bis")
    .eq("user_id", nutzer.id)
    .in("status", ["offen", "genehmigt"])
    .lte("von", a.bis)
    .gte("bis", a.von)
    .limit(1);
  if (andere?.length) {
    return { fehler: `Für diese Tage gibt es schon einen Antrag (${formatDatum(andere[0].von)}–${formatDatum(andere[0].bis)}).` };
  }

  if (a.art === "ueberstundenabbau") {
    const fehler = await abbauFehler(nutzer.id, a.von, a.bis);
    if (fehler) return { fehler };
  }

  const { error } = await supabase.from("leave_requests").insert({
    id: a.id,
    user_id: nutzer.id,
    von: a.von,
    bis: a.bis,
    art: a.art,
    bemerkung: a.bemerkung || null,
    status: "offen",
  });
  if (error && error.code !== "23505") return { fehler: "Der Antrag konnte nicht gespeichert werden." };

  aktualisieren();
  return {};
}

/**
 * Abfeiern geht nur, solange das Überstundenkonto danach nicht negativ wird (Entscheidung Mika, 16.10.2026).
 * Diese Prüfung läuft hier auf dem Server; endgültig entscheidet der Admin beim Genehmigen.
 */
async function abbauFehler(userId: string, von: string, bis: string): Promise<string | null> {
  const heute = heuteIso();
  const konto = (await kontenLaden({ monat: heute.slice(0, 7), userIds: [userId] })).get(userId);
  if (!konto) return "Für dich ist noch kein Überstundenkonto eingerichtet. Bitte im Büro melden.";
  if (sollSumme(von, bis, konto.soll) === 0) return "In diesem Zeitraum gibt es keinen Arbeitstag zum Abfeiern (Wochenende oder Feiertag).";

  const supabase = await createClient();
  const { data: andere } = await supabase
    .from("leave_requests")
    .select("von, bis")
    .eq("user_id", userId)
    .eq("art", "ueberstundenabbau")
    .in("status", ["offen", "genehmigt"])
    .gte("bis", heute);
  const r = abbauPruefen({ stand: konto.stand, soll: konto.soll, heute, neu: { von, bis }, vorgemerkt: andere ?? [] });
  if (r.ok) return null;
  return (
    `Dein Überstundenkonto reicht dafür nicht: Stand ${formatStundenSaldo(konto.stand)}, ` +
    `dieser Antrag braucht ${formatStunden(r.benoetigt)}` +
    (r.reserviert > 0 ? `, andere Anträge schon ${formatStunden(r.reserviert)}` : "") +
    ". Beantrage weniger Tage."
  );
}

export async function urlaubZurueckziehen(antragId: string): Promise<UrlaubErgebnis> {
  const nutzer = await requireRecht("urlaub_beantragen");
  if (!z.uuid().safeParse(antragId).success) return { fehler: "Ungültiger Antrag." };

  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_requests")
    .update({ status: "zurueckgezogen" })
    .eq("id", antragId)
    .eq("user_id", nutzer.id)
    .eq("status", "offen")
    .select("id");
  if (!data?.length) {
    const { data: jetzt } = await supabase.from("leave_requests").select("status").eq("id", antragId).maybeSingle();
    if (jetzt?.status === "zurueckgezogen") return {};
    return { fehler: "Zurückziehen geht nur, solange der Antrag offen ist." };
  }
  aktualisieren();
  return {};
}
