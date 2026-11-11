import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { RAUM_ARTEN, type GrundrissErgebnis } from "@/lib/flaechen-typen";

// Grundriss-PDF → Räume über die Claude-Schnittstelle (Anthropic). Dieser Teil ist rein (kein server-only) und ohne Netzwerk testbar:
// Der eigentliche Aufruf wird hineingereicht (siehe `grundriss-lesen.ts`). Es gibt keinen Textparser mehr und keinen Ersatzweg.

// ---- hier ändern: Modell und Aufwand für das Grundriss-Lesen ----
export const GRUNDRISS_KI_MODELL = "claude-sonnet-5-5";
/** Sonnet 5.5 nutzt sonst „high“; zum Abschreiben der Raumstempel reicht „low“ (schneller, günstiger). */
export const GRUNDRISS_KI_AUFWAND = "low" as const;
// -----------------------------------------------------------------

/** Größte erlaubte PDF-Datei (4 MB). */
export const GRUNDRISS_MAX_BYTES = 4 * 1024 * 1024;
/** Großzügig, damit auch Pläne mit vielen Wohnungen nicht abgeschnitten werden. */
export const GRUNDRISS_MAX_TOKENS = 16000;

export const FEHLER_OHNE_SCHLUESSEL =
  "Für das Auslesen fehlt der Schlüssel ANTHROPIC_API_KEY (lokal in .env.local, online in Vercel eintragen). Es wurde nichts gesendet.";
export const FEHLER_ZWEIMAL_UNGUELTIG =
  "Die KI hat zweimal keine gültige Antwort geliefert. Bitte nochmal versuchen oder die Räume von Hand eintragen.";
export const FEHLER_LEER = "Die Datei ist leer.";
export const FEHLER_ZU_GROSS = "Die Datei ist größer als 4 MB. Bitte eine kleinere PDF-Datei wählen (z. B. nur die Grundriss-Seiten).";
export const FEHLER_ABGELEHNT = "Die KI hat das Lesen dieses Plans abgelehnt. Bitte die Räume von Hand eintragen.";
export const FEHLER_ABGESCHNITTEN =
  "Der Plan ist zu umfangreich für einen Durchgang (Antwort abgeschnitten). Bitte das PDF in kleinere Teile aufteilen oder die Räume von Hand eintragen.";

/** JSON-Schema für Structured Outputs (`output_config.format`). */
export const GRUNDRISS_SCHEMA = {
  type: "object",
  properties: {
    raeume: {
      type: "array",
      items: {
        type: "object",
        properties: {
          geschoss: { type: "string", description: "Geschoss wie im Plantitel, z. B. „Erdgeschoss“" },
          wohnung: { type: "string", description: "Wohnung, falls im Plan erkennbar, sonst leerer Text" },
          raumname: { type: "string", description: "Raumname genau wie im Plan" },
          art: { type: "string", enum: [...RAUM_ARTEN] },
          flaeche_m2: {
            anyOf: [{ type: "number" }, { type: "null" }],
            description: "Lichte Raumfläche (DIN-F / NGF / Netto) in m², null wenn nicht eindeutig lesbar",
          },
          seite: { type: "integer", description: "Seitennummer im PDF ab 1" },
        },
        required: ["geschoss", "wohnung", "raumname", "art", "flaeche_m2", "seite"],
        additionalProperties: false,
      },
    },
  },
  required: ["raeume"],
  additionalProperties: false,
} as const;

/** System-Anweisung für das Lesen eines Grundrisses. */
export function grundrissAnweisung(): string {
  return [
    "Du liest Grundrisse (Architektenpläne, PDF, eine oder mehrere Seiten) für einen Malerbetrieb und schreibst JEDEN Raum ab.",
    "Antworte nur im vorgegebenen JSON-Format. Jede Regel gilt für JEDEN Raum:",
    "",
    "- geschoss: aus dem Plantitel der Seite, so wie dort geschrieben (z. B. „Erdgeschoss“, „1. Obergeschoss“, „2. Obergeschoss“, „Dachgeschoss“, „Kellergeschoss“).",
    "- wohnung: nur wenn im Plan erkennbar (z. B. „Wohnung 1“, „WE 2“), sonst leerer Text.",
    "- raumname: genau wie im Plan geschrieben.",
    "- flaeche_m2: Hat ein Raum mehrere Flächenangaben, zählt NUR die lichte Raumfläche (DIN-F, NGF bzw. Netto). Brutto-F wird ignoriert. Fensterflächen (FF) und ähnliche Angaben sind keine Raumflächen.",
    "- Ist ein Wert nicht eindeutig lesbar: flaeche_m2 = null. Nichts erfinden, nichts schätzen, nichts aus Maßketten ausrechnen.",
    "- Gleiche Räume in mehreren Wohnungen oder Geschossen (z. B. mehrmals „Bad“) sind getrennte Einträge. Keine Duplikate: jeden Raumstempel genau einmal aufnehmen.",
    "- art:",
    "  - Balkon, Terrasse, Dachterrasse, Loggia → \"aussen\"",
    "  - Treppenhaus → \"treppenhaus\"",
    "  - Technik, HAR, Hausanschlussraum, Heizung → \"technik\"",
    "  - Räume eines Nebengebäudes sowie Abstell-, Fahrrad- und Geräteräume außerhalb der Wohnungen → \"nebengebaeude\"",
    "  - Bad → \"bad\"",
    "  - WC, Gäste-WC → \"wc\"",
    "  - alles andere → \"wohnraum\" (auch HWR und Abstellraum innerhalb einer Wohnung)",
    "- Keine Räume sind: Adressen, Ortsnamen, Bauherr, Planverfasser, Plankopf, Maßketten und Summen (z. B. „Wohnfläche gesamt“).",
    "- seite: Seitennummer im PDF, beginnend bei 1.",
  ].join("\n");
}

const raumSchema = z.object({
  geschoss: z.string(),
  wohnung: z.string(),
  raumname: z.string(),
  art: z.enum(RAUM_ARTEN),
  flaeche_m2: z.number().nullable(),
  seite: z.number(),
});
const antwortSchema = z.object({ raeume: z.array(raumSchema) });

function kuerzen(text: string, laenge: number): string {
  return text.trim().slice(0, laenge).trim();
}

function flaeche(wert: number | null): number | null {
  if (wert === null || !Number.isFinite(wert) || wert <= 0 || wert > 2000) return null;
  return Math.round(wert * 100) / 100;
}

/** Prüft die KI-Antwort und macht daraus Räume. Ungültig → `null`. Gleiche Räume bleiben getrennt (keine Deduplizierung). */
export function raeumeAusAntwort(roh: unknown): GrundrissErgebnis["raeume"] | null {
  const geprueft = antwortSchema.safeParse(roh);
  if (!geprueft.success) return null;
  return geprueft.data.raeume
    .map((r) => ({
      geschoss: kuerzen(r.geschoss, 40),
      wohnung: kuerzen(r.wohnung, 60),
      name: kuerzen(r.raumname, 120),
      boden: flaeche(r.flaeche_m2),
      art: r.art,
      seite: Number.isInteger(r.seite) && r.seite >= 1 ? r.seite : 1,
      quelle: "ki" as const,
    }))
    .filter((r) => r.name !== "");
}

// ---- Ablauf mit hineingereichtem Aufruf ----

/** Die Anfrage an die Messages-Schnittstelle (ohne Beta-Felder). */
export type GrundrissAnfrage = {
  model: string;
  max_tokens: number;
  output_config: {
    effort: typeof GRUNDRISS_KI_AUFWAND;
    format: { type: "json_schema"; schema: Record<string, unknown> };
  };
  system: string;
  messages: [
    {
      role: "user";
      content: [
        { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } },
        { type: "text"; text: string },
      ];
    },
  ];
};

/** Das, was vom Ergebnis gebraucht wird. */
export type GrundrissAntwort = {
  model?: string;
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number };
};

export type GrundrissAufruf = (anfrage: GrundrissAnfrage) => Promise<GrundrissAntwort>;

/** Baut die Anfrage: PDF als document-Block vor dem kurzen Auftrag. */
export function grundrissAnfrage(pdfBase64: string): GrundrissAnfrage {
  return {
    model: GRUNDRISS_KI_MODELL,
    max_tokens: GRUNDRISS_MAX_TOKENS,
    output_config: {
      effort: GRUNDRISS_KI_AUFWAND,
      format: { type: "json_schema", schema: GRUNDRISS_SCHEMA as unknown as Record<string, unknown> },
    },
    system: grundrissAnweisung(),
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: "Lies alle Räume aus diesem Grundriss." },
        ],
      },
    ],
  };
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Verständlicher Text für Fehler der Schnittstelle. */
export function apiFehlerText(fehler: unknown): string {
  if (fehler instanceof Anthropic.AuthenticationError) return "Der Schlüssel ANTHROPIC_API_KEY ist ungültig.";
  if (fehler instanceof Anthropic.RateLimitError) return "Zu viele Anfragen, bitte gleich nochmal.";
  if (fehler instanceof Anthropic.APIError) return `Die KI ist gerade nicht erreichbar (Fehler ${fehler.status ?? "unbekannt"}).`;
  return "Beim Auslesen ist ein Fehler aufgetreten. Bitte nochmal versuchen oder die Räume von Hand eintragen.";
}

/**
 * Liest einen Grundriss über den hineingereichten Aufruf. Ohne Schlüssel wird nichts gesendet.
 * Ungültige Antwort (kein Text, JSON kaputt, Schema falsch) → genau eine Wiederholung. Stürzt nie ab.
 */
export async function grundrissLesenMit(
  bytes: Uint8Array,
  schluessel: string | undefined,
  aufruf: GrundrissAufruf,
): Promise<GrundrissErgebnis> {
  if (!schluessel || schluessel.trim() === "") return { raeume: [], fehler: FEHLER_OHNE_SCHLUESSEL };
  if (bytes.byteLength === 0) return { raeume: [], fehler: FEHLER_LEER };
  if (bytes.byteLength > GRUNDRISS_MAX_BYTES) return { raeume: [], fehler: FEHLER_ZU_GROSS };

  const anfrage = grundrissAnfrage(base64(bytes));
  const tokens = { eingabe: 0, ausgabe: 0 };

  for (let versuch = 1; versuch <= 2; versuch++) {
    let antwort: GrundrissAntwort;
    try {
      antwort = await aufruf(anfrage);
    } catch (fehler) {
      const text = apiFehlerText(fehler);
      // Nur Status/Art ins Protokoll, nie Inhalte oder den Schlüssel
      console.error(`[grundriss-ki] ${text}`);
      return { raeume: [], fehler: text, ...(tokens.eingabe || tokens.ausgabe ? { tokens } : {}) };
    }

    // Nur Zahlen ins Protokoll, nie Inhalte des Plans
    console.info(
      `[grundriss-ki] ${antwort.model ?? GRUNDRISS_KI_MODELL} effort=${GRUNDRISS_KI_AUFWAND}: ${antwort.usage.input_tokens} Token ein, ${antwort.usage.output_tokens} Token aus`,
    );
    tokens.eingabe += antwort.usage.input_tokens;
    tokens.ausgabe += antwort.usage.output_tokens;

    if (antwort.stop_reason === "refusal") return { raeume: [], fehler: FEHLER_ABGELEHNT, tokens };
    if (antwort.stop_reason === "max_tokens") return { raeume: [], fehler: FEHLER_ABGESCHNITTEN, tokens };

    const text = antwort.content.find((b) => b.type === "text" && typeof b.text === "string")?.text;
    if (text !== undefined) {
      let json: unknown = undefined;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      const raeume = json === undefined ? null : raeumeAusAntwort(json);
      if (raeume) return { raeume, tokens };
    }
    console.warn(`[grundriss-ki] Ungültige Antwort (Versuch ${versuch} von 2).`);
  }

  return { raeume: [], fehler: FEHLER_ZWEIMAL_UNGUELTIG, tokens };
}
