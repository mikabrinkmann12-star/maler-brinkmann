import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { extractText, getDocumentProxy } from "unpdf";
import type { GrundrissErgebnis } from "@/lib/flaechen-typen";
import { KI_MAX_BYTES, kiKonfiguration } from "@/lib/eingangsrechnung-ki-regeln";
import { GRUNDRISS_KI_SCHEMA, grundrissKiAnweisung, raeumeAusKiAntwort, raeumeAusText, type GelesenerRaum } from "@/lib/grundriss-text";

// Liest Räume (Geschoss, Name, Bodenfläche) aus einem Grundriss-PDF:
// 1. Text des PDFs (CAD-Export mit Raumstempeln): kein Fremddienst.
// 2. Nur wenn dort nichts gefunden wird UND die KI eingeschaltet ist (dieselbe Anbindung wie beim Auslesen von Eingangsrechnungen:
//    `KI_RECHNUNG_AKTIV=1` und `ANTHROPIC_API_KEY`, Modell `KI_MODELL`): das PDF geht an die KI. Ist sie aus (Standard), geht nichts raus.
// Das Ergebnis ist immer ungeprüft; das Büro prüft jeden Raum.

const HINWEIS_KEIN_PDF = "Die Datei konnte nicht als PDF gelesen werden.";
const HINWEIS_OHNE_KI =
  "Im PDF wurde kein lesbarer Text mit Raumflächen gefunden (z. B. eingescannter Plan). Bitte die Räume von Hand eintragen. Die KI-Auswertung ist ausgeschaltet.";
const HINWEIS_MIT_KI = "Auch die KI hat keine Räume gefunden. Bitte von Hand eintragen.";

/** Text je Seite; `null` = keine gültige PDF-Datei. */
async function seitenText(bytes: Uint8Array): Promise<string[] | null> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    return text;
  } catch {
    return null;
  }
}

/** Liest den Grundriss mit der KI; `null` = aus, zu groß, Fehler oder Ablehnung. */
async function grundrissMitKiLesen(bytes: Uint8Array): Promise<GelesenerRaum[] | null> {
  const konfig = kiKonfiguration(process.env);
  if (!konfig.aktiv) return null;
  if (bytes.byteLength === 0 || bytes.byteLength > KI_MAX_BYTES) return null;

  const client = new Anthropic({ apiKey: konfig.apiKey, maxRetries: 1, timeout: 120_000 });
  const daten = Buffer.from(bytes).toString("base64");

  try {
    const antwort = await client.messages.create({
      model: konfig.modell,
      max_tokens: 8000,
      output_config: { effort: "low", format: { type: "json_schema", schema: GRUNDRISS_KI_SCHEMA as unknown as Record<string, unknown> } },
      system: grundrissKiAnweisung(),
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: daten } },
            { type: "text", text: "Schreibe die Räume dieses Grundrisses mit Geschoss, Name und Bodenfläche ab." },
          ],
        },
      ],
    });
    // Nur Zahlen ins Protokoll, nie Inhalte des Plans
    console.info(`[ki-grundriss] ${konfig.modell}: ${antwort.usage.input_tokens} Token ein, ${antwort.usage.output_tokens} Token aus`);
    if (antwort.stop_reason === "refusal") {
      console.warn("[ki-grundriss] Die KI hat das Lesen abgelehnt.");
      return null;
    }
    const text = antwort.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    return raeumeAusKiAntwort(JSON.parse(text.text));
  } catch (fehler) {
    // Ein Ausfall der KI darf nie zum Absturz führen: Das Büro trägt die Räume dann von Hand ein.
    if (fehler instanceof Anthropic.APIError) console.error(`[ki-grundriss] Fehler ${fehler.status}: ${fehler.message}`);
    else console.error("[ki-grundriss] Die Antwort konnte nicht gelesen werden.");
    return null;
  }
}

/** Liest die Räume aus einem Grundriss-PDF: erst aus dem Text, sonst (nur wenn eingeschaltet) mit der KI. */
export async function grundrissLesen(bytes: Uint8Array): Promise<GrundrissErgebnis> {
  const seiten = await seitenText(bytes);
  if (!seiten) return { raeume: [], verfahren: "keine", hinweis: HINWEIS_KEIN_PDF };

  const ausText = raeumeAusText(seiten);
  if (ausText.length > 0) return { raeume: ausText, verfahren: "pdf" };

  if (!kiKonfiguration(process.env).aktiv) return { raeume: [], verfahren: "keine", hinweis: HINWEIS_OHNE_KI };

  const ausKi = await grundrissMitKiLesen(bytes);
  if (ausKi && ausKi.length > 0) return { raeume: ausKi, verfahren: "ki" };
  return { raeume: [], verfahren: "keine", hinweis: HINWEIS_MIT_KI };
}
