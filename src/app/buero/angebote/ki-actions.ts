"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBueroRecht } from "@/lib/auth";
import type { AngebotKiErgebnis } from "@/lib/angebot-ki";
import { angebotKiVorschlagen } from "@/lib/angebot-ki-lesen";
import { MAX_KI_BESCHREIBUNG } from "@/lib/ki";
import { createClient } from "@/lib/supabase/server";

/** KI-Vorschlag für ein Angebot. Speichert nie etwas: Ein Vorschlag wird erst mit „Übernehmen“ ins Angebot geschrieben. */
export async function kiVorschlagen(angebotId: string, beschreibung: string): Promise<AngebotKiErgebnis> {
  await requireBueroRecht("angebote");
  if (!z.uuid().safeParse(angebotId).success) return { ok: false, fehler: "Ungültiges Angebot." };
  const text = beschreibung.trim();
  if (!text) return { ok: false, fehler: "Bitte beschreibe kurz, was gemacht werden soll." };
  if (text.length > MAX_KI_BESCHREIBUNG) return { ok: false, fehler: `Die Beschreibung ist zu lang (höchstens ${MAX_KI_BESCHREIBUNG} Zeichen).` };
  return angebotKiVorschlagen(text);
}

const positionSchema = z.object({
  serviceId: z.uuid().nullable(),
  kurztext: z.string().trim().min(1).max(200),
  menge: z.number().finite().positive().max(1_000_000),
  einheit: z.string().trim().min(1).max(20),
});

/**
 * Ausgewählte Vorschläge ans Ende des Angebots hängen. Bei Leistungen kommen Name, Langtext, Einheit und Preis aus den Stammdaten,
 * freie Positionen bekommen Preis 0 (im Angebot ergänzen). Die Datenbank sperrt versendete Angebote zusätzlich.
 */
export async function kiUebernehmen(angebotId: string, eingabe: unknown): Promise<{ fehler?: string; hinweis?: string }> {
  await requireBueroRecht("angebote");
  if (!z.uuid().safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  const p = z.array(positionSchema).min(1, "Bitte mindestens eine Position anhaken.").max(60).safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };

  const supabase = await createClient();
  const { data: angebot } = await supabase.from("quotes").select("status, archiviert_am").eq("id", angebotId).maybeSingle();
  if (!angebot) return { fehler: "Angebot nicht gefunden." };
  if (angebot.status !== "entwurf" || angebot.archiviert_am) return { fehler: "Dieses Angebot ist gesperrt. Setze es zuerst zurück auf Entwurf." };

  const ids = [...new Set(p.data.map((x) => x.serviceId).filter((x): x is string => Boolean(x)))];
  const { data: leistungen, error } = ids.length
    ? await supabase.from("services").select("id, name, langtext, einheit, vk, archiviert_am").in("id", ids)
    : { data: [], error: null };
  if (error) return { fehler: "Die Leistungen konnten nicht geladen werden." };
  const nachId = new Map((leistungen ?? []).filter((l) => !l.archiviert_am).map((l) => [l.id, l]));

  const { data: letzte } = await supabase.from("quote_items").select("sortierung").eq("quote_id", angebotId).order("sortierung", { ascending: false }).limit(1);
  const start = (letzte?.[0]?.sortierung ?? -1) + 1;
  let ohnePreis = 0;
  const { error: einfuegen } = await supabase.from("quote_items").insert(
    p.data.map((x, i) => {
      const l = x.serviceId ? nachId.get(x.serviceId) : undefined;
      if (!l) ohnePreis += 1;
      return {
        quote_id: angebotId,
        sortierung: start + i,
        typ: "position" as const,
        kurztext: l?.name ?? x.kurztext,
        langtext: l?.langtext || null,
        menge: x.menge,
        einheit: l?.einheit ?? x.einheit,
        einzelpreis: l ? Number(l.vk ?? 0) : 0,
        service_id: l?.id ?? null,
        material_id: null,
      };
    }),
  );
  if (einfuegen) return { fehler: einfuegen.code === "P0001" ? einfuegen.message : "Speichern hat nicht geklappt. Bitte nochmal versuchen." };

  revalidatePath("/buero/angebote", "layout");
  revalidatePath(`/buero/angebote/${angebotId}`);
  const n = p.data.length;
  return { hinweis: `${n} ${n === 1 ? "Position" : "Positionen"} übernommen.${ohnePreis ? ` ${ohnePreis} ohne Leistung aus den Stammdaten: Preis bitte im Angebot eintragen.` : ""}` };
}
