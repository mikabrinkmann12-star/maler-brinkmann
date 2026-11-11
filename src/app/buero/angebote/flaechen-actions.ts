"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBueroRecht } from "@/lib/auth";
import { standardPruefen, zeilenMenge } from "@/lib/flaechen";
import { createClient } from "@/lib/supabase/server";

// Flächenberechnung aus dem Grundriss (Angebot → „Flächen aus Grundriss“). Neue Funktion, dockt nur über `quote_items` an:
// Die Räume werden nicht gespeichert, ins Angebot kommen nur Positionen mit Leistung und Preis aus den Stammdaten.
// Das Lesen des PDFs läuft über die Route `[id]/flaechen/grundriss`.

const uuid = z.uuid();

const zahl = z.number().finite().min(0).max(100_000).nullable();
const raumSchema = z.object({
  id: z.string().min(1).max(64),
  geschoss: z.string().trim().max(40),
  name: z.string().trim().max(120),
  boden: zahl,
  umfang: zahl,
  hoehe: zahl,
  decke: zahl,
  art: z.enum(["normal", "nass", "treppenhaus", "technik", "aussen"]),
  belag: z.boolean(),
  sockel: z.boolean(),
  geprueft: z.boolean(),
  quelle: z.enum(["pdf", "ki", "hand"]),
});
const bereichSchema = z.discriminatedUnion("art", [
  z.object({ art: z.literal("alle") }),
  z.object({ art: z.literal("geschoss"), geschoss: z.string().max(40) }),
  z.object({ art: z.literal("raeume"), ids: z.array(z.string().max(64)).min(1).max(500) }),
]);
const uebernehmenSchema = z.object({
  raeume: z.array(raumSchema).min(1, "Es gibt noch keine Räume.").max(500),
  zeilen: z
    .array(z.object({ id: z.string().max(64), serviceId: z.uuid("Bitte bei jeder Zeile eine Leistung wählen."), flaeche: z.enum(["boden", "decke", "wand", "sockel"]), bereich: bereichSchema }))
    .min(1, "Bitte mindestens eine Leistung wählen.")
    .max(200),
  standard: z.unknown(),
});

/**
 * Gewählte Leistungen als Positionen ans Ende des Angebots anhängen. Menge = Fläche des Bereichs (nur geprüfte Räume, sonst Abbruch),
 * Preis, Name, Text und Einheit kommen aus den Stammdaten (Leistungen). Die Datenbank sperrt versendete Angebote zusätzlich.
 */
export async function flaechenUebernehmen(angebotId: string, eingabe: unknown): Promise<{ fehler?: string; hinweis?: string }> {
  await requireBueroRecht("angebote");
  if (!uuid.safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  const p = uebernehmenSchema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  const { raeume, zeilen } = p.data;
  const std = standardPruefen(p.data.standard);

  // Mengen nur aus geprüften Räumen; jede Zeile mit Fehler stoppt alles (nichts halb übernehmen)
  const mengen: number[] = [];
  for (const [i, zeile] of zeilen.entries()) {
    const m = zeilenMenge(raeume, zeile, std);
    if (m.fehler) return { fehler: `Leistung ${i + 1}: ${m.fehler}` };
    if (!(m.menge > 0)) return { fehler: `Leistung ${i + 1}: Die Menge ist 0.` };
    mengen.push(m.menge);
  }

  const supabase = await createClient();
  const { data: angebot } = await supabase.from("quotes").select("status, archiviert_am").eq("id", angebotId).maybeSingle();
  if (!angebot) return { fehler: "Angebot nicht gefunden." };
  if (angebot.status !== "entwurf" || angebot.archiviert_am) return { fehler: "Dieses Angebot ist gesperrt. Setze es zuerst zurück auf Entwurf." };

  const ids = [...new Set(zeilen.map((z) => z.serviceId))];
  const { data: leistungen, error } = await supabase.from("services").select("id, name, langtext, einheit, vk, archiviert_am").in("id", ids);
  if (error) return { fehler: "Die Leistungen konnten nicht geladen werden." };
  const nachId = new Map((leistungen ?? []).map((l) => [l.id, l]));
  for (const [i, z] of zeilen.entries()) {
    const l = nachId.get(z.serviceId);
    if (!l || l.archiviert_am) return { fehler: `Leistung ${i + 1}: Die Leistung gibt es in den Stammdaten nicht mehr.` };
  }

  const { data: letzte } = await supabase.from("quote_items").select("sortierung").eq("quote_id", angebotId).order("sortierung", { ascending: false }).limit(1);
  const start = (letzte?.[0]?.sortierung ?? -1) + 1;
  const { error: einfuegen } = await supabase.from("quote_items").insert(
    zeilen.map((z, i) => {
      const l = nachId.get(z.serviceId)!;
      return {
        quote_id: angebotId,
        sortierung: start + i,
        typ: "position" as const,
        kurztext: l.name,
        langtext: l.langtext || null,
        menge: mengen[i],
        einheit: l.einheit,
        einzelpreis: Number(l.vk),
        service_id: l.id,
        material_id: null,
      };
    }),
  );
  if (einfuegen) return { fehler: einfuegen.code === "P0001" ? einfuegen.message : "Speichern hat nicht geklappt. Bitte nochmal versuchen." };

  revalidatePath("/buero/angebote", "layout");
  revalidatePath(`/buero/angebote/${angebotId}`);
  return { hinweis: `${zeilen.length} ${zeilen.length === 1 ? "Position" : "Positionen"} ins Angebot übernommen.` };
}
