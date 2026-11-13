// KI-Assistent für Angebote (Mika, 13.11.2026: „mit meinem API-Key aktiv“): Aus einer Beschreibung („Wohnzimmer 25 m² Wände weiß
// streichen …“) schlägt Claude Positionen vor, möglichst aus den Leistungen der Stammdaten. Diese Datei ist ohne Netz testbar:
// Der eigentliche Aufruf wird hineingereicht (angebot-ki-lesen.ts). Preise kommen NIE von der KI, sondern beim Übernehmen
// aus den Stammdaten; freie Positionen ohne Leistung kommen mit Preis 0 und müssen im Angebot ergänzt werden.

/** Modell und Aufwand (eine Stelle zum Ändern). Kosten: etwa 1–4 Cent pro Vorschlag, je nach Größe des Katalogs. */
export const ANGEBOT_KI_MODELL = "claude-opus-5-5";
export const ANGEBOT_KI_AUFWAND = "low" as const;
const MAX_TOKENS = 8000;
/** Höchstens so viele Leistungen gehen als Katalog mit (die übrigen kennt die KI nicht). */
export const MAX_KATALOG = 400;

export type KatalogLeistung = { id: string; name: string; einheit: string; nummer?: string | null };

export type KiPositionVorschlag = {
  /** Leistung aus den Stammdaten oder null (freie Position) */
  serviceId: string | null;
  kurztext: string;
  menge: number;
  einheit: string;
  /** Kurze Begründung bzw. Annahme der KI, z. B. „Wandfläche geschätzt aus 25 m² Boden“ */
  hinweis: string;
};

export type AngebotKiErgebnis =
  | { ok: true; positionen: KiPositionVorschlag[]; hinweis: string }
  | { ok: false; fehler: string };

export const ANGEBOT_KI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["positionen", "hinweis"],
  properties: {
    hinweis: { type: "string", description: "Kurzer Hinweis an das Büro: Annahmen, fehlende Angaben. Leer, wenn nichts." },
    positionen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["leistung", "kurztext", "menge", "einheit", "hinweis"],
        properties: {
          leistung: { type: "string", description: "Kennung (L1, L2 …) der passenden Leistung aus dem Katalog oder leer, wenn keine passt." },
          kurztext: { type: "string" },
          menge: { type: "number" },
          einheit: { type: "string" },
          hinweis: { type: "string", description: "Wie die Menge zustande kommt (Annahme), sonst leer." },
        },
      },
    },
  },
} as const;

export function angebotKiAnweisung(): string {
  return [
    "Du hilfst einem Malerbetrieb in Deutschland, aus einer kurzen Beschreibung Positionen für ein Angebot zu machen.",
    "Nutze möglichst Leistungen aus dem Katalog (Kennung L1, L2 … in `leistung`, Kurztext und Einheit wie im Katalog).",
    "Nur wenn nichts passt: freie Position mit leerer `leistung`, kurzem deutschen Kurztext und üblicher Einheit (m², lfm, Stk., Std., psch.).",
    "Mengen: Nimm die Angaben aus der Beschreibung. Fehlt eine Menge, schätze vorsichtig aus den Angaben (z. B. Wandfläche ≈ Umfang × Höhe)",
    "und schreibe die Annahme in `hinweis`. Ohne jeden Anhaltspunkt Menge 1 und Hinweis „Menge prüfen“.",
    "Keine Preise. Keine Positionen erfinden, die nicht zur Beschreibung gehören. Übliche Vorarbeiten (Abdecken, Grundieren) nur, wenn sie im Katalog stehen.",
    "Antworte nur im vorgegebenen JSON-Format, alle Texte auf Deutsch.",
  ].join("\n");
}

/** Katalog als kurze Liste: „L1 | 02.01 | Wandfläche streichen | m²“. Kennungen statt UUIDs sparen Token und Fehler. */
export function katalogText(katalog: KatalogLeistung[]): string {
  return katalog.map((l, i) => `L${i + 1} | ${l.nummer ?? ""} | ${l.name.replace(/\s+/g, " ").slice(0, 120)} | ${l.einheit}`).join("\n");
}

export type AngebotKiAnfrage = {
  model: string;
  max_tokens: number;
  output_config: { effort: typeof ANGEBOT_KI_AUFWAND; format: { type: "json_schema"; schema: Record<string, unknown> } };
  system: string;
  messages: [{ role: "user"; content: string }];
};

export type AngebotKiAntwort = {
  model?: string;
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number };
};

export function angebotKiAnfrage(beschreibung: string, katalog: KatalogLeistung[]): AngebotKiAnfrage {
  return {
    model: ANGEBOT_KI_MODELL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: ANGEBOT_KI_AUFWAND, format: { type: "json_schema", schema: ANGEBOT_KI_SCHEMA as unknown as Record<string, unknown> } },
    system: angebotKiAnweisung(),
    messages: [{
      role: "user",
      content: `Katalog (Kennung | Nummer | Leistung | Einheit):\n${katalog.length ? katalogText(katalog) : "(leer)"}\n\nBeschreibung:\n${beschreibung}`,
    }],
  };
}

/** Antwort prüfen und Kennungen (L1 …) auf die Leistungen zurückführen. null = unbrauchbar (dann einmal wiederholen). */
export function angebotKiAuswerten(antwort: AngebotKiAntwort, katalog: KatalogLeistung[]): { positionen: KiPositionVorschlag[]; hinweis: string } | null {
  const text = antwort.content.find((b) => b.type === "text")?.text;
  if (!text) return null;
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return null;
  }
  if (!roh || typeof roh !== "object" || !Array.isArray((roh as { positionen?: unknown }).positionen)) return null;
  const r = roh as { positionen: Record<string, unknown>[]; hinweis?: unknown };
  const positionen: KiPositionVorschlag[] = [];
  for (const p of r.positionen.slice(0, 60)) {
    const m = /^L(\d+)$/i.exec(String(p.leistung ?? "").trim());
    const leistung = m ? katalog[Number(m[1]) - 1] : undefined;
    const menge = Number(p.menge);
    const kurztext = String(p.kurztext ?? "").trim().slice(0, 200);
    if (!leistung && !kurztext) continue;
    positionen.push({
      serviceId: leistung?.id ?? null,
      kurztext: leistung?.name ?? kurztext,
      menge: Number.isFinite(menge) && menge > 0 ? Math.round(menge * 100) / 100 : 1,
      einheit: (leistung?.einheit ?? String(p.einheit ?? "").trim().slice(0, 20)) || "Stk.",
      hinweis: String(p.hinweis ?? "").trim().slice(0, 300),
    });
  }
  return { positionen, hinweis: typeof r.hinweis === "string" ? r.hinweis.trim().slice(0, 500) : "" };
}

/** Fragt über den hineingereichten Aufruf; bei unbrauchbarer Antwort genau eine Wiederholung. Stürzt nie ab. */
export async function angebotKiVorschlagenMit(
  beschreibung: string,
  katalog: KatalogLeistung[],
  aufruf: (a: AngebotKiAnfrage) => Promise<AngebotKiAntwort>,
  fehlerText: (f: unknown) => string,
): Promise<AngebotKiErgebnis> {
  const anfrage = angebotKiAnfrage(beschreibung, katalog);
  for (let versuch = 1; versuch <= 2; versuch++) {
    let antwort: AngebotKiAntwort;
    try {
      antwort = await aufruf(anfrage);
    } catch (f) {
      const text = fehlerText(f);
      console.error(`[angebot-ki] ${text}`);
      return { ok: false, fehler: text };
    }
    console.info(`[angebot-ki] ${antwort.model ?? ANGEBOT_KI_MODELL} effort=${ANGEBOT_KI_AUFWAND}: ${antwort.usage.input_tokens} Token ein, ${antwort.usage.output_tokens} Token aus`);
    if (antwort.stop_reason === "refusal") return { ok: false, fehler: "Die KI hat diese Anfrage abgelehnt. Bitte anders beschreiben." };
    const e = angebotKiAuswerten(antwort, katalog);
    if (e && e.positionen.length) return { ok: true, ...e };
    if (e && versuch === 2) return { ok: false, fehler: e.hinweis || "Die KI hat keine Positionen gefunden. Bitte genauer beschreiben." };
  }
  return { ok: false, fehler: "Die Antwort der KI war unbrauchbar. Bitte nochmal versuchen." };
}
