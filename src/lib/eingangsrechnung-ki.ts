import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ErkannteFelder } from "@/lib/eingangsrechnung-erkennung";
import { KI_MAX_BYTES, KI_SCHEMA, felderAusKiAntwort, kiAnweisung, kiKonfiguration, kiMedienTyp, type KiKonfiguration } from "@/lib/eingangsrechnung-ki-regeln";

// KI-Auslesen von Eingangsrechnungen über die Claude-Schnittstelle (Anthropic). AUSGESCHALTET, solange `KI_RECHNUNG_AKTIV=1` und
// `ANTHROPIC_API_KEY` nicht beide gesetzt sind (lokal `.env.local`, online Vercel). Erst dann geht eine Rechnung an den Dienst.
// Kosten: Abrechnung pro Nutzung (Eingabe und Ausgabe), bei einer Rechnung typischerweise wenige Cent; das Modell lässt sich mit
// `KI_MODELL` wählen (Standard `claude-opus-5-5`, günstiger z. B. `claude-haiku-5-5`). Rechtliches vor dem Einschalten: Vertrag zur
// Auftragsverarbeitung mit dem Anbieter und die Zusage, dass nicht mit den Daten trainiert wird (siehe docs/EINKAUFSLISTE.md).

export function kiRechnungKonfiguration(): KiKonfiguration {
  return kiKonfiguration(process.env);
}

export type KiAuslesen = (bytes: Uint8Array, endung: string, eigeneNamen: string[]) => Promise<ErkannteFelder | null>;

/** Liest eine Rechnung (PDF oder Bild) mit der KI. Gibt `null` zurück, wenn die KI aus ist, nichts liefert oder etwas schiefgeht. */
export async function rechnungMitKiLesen(bytes: Uint8Array, endung: string, eigeneNamen: string[]): Promise<ErkannteFelder | null> {
  const konfig = kiRechnungKonfiguration();
  if (!konfig.aktiv) return null;
  const medium = kiMedienTyp(endung);
  if (!medium || bytes.byteLength === 0 || bytes.byteLength > KI_MAX_BYTES) return null;

  const client = new Anthropic({ apiKey: konfig.apiKey, maxRetries: 1, timeout: 90_000 });
  const daten = Buffer.from(bytes).toString("base64");
  const datei =
    medium === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: medium, data: daten } } as const)
      : ({ type: "image", source: { type: "base64", media_type: medium, data: daten } } as const);

  try {
    const antwort = await client.messages.create({
      model: konfig.modell,
      max_tokens: 1500,
      // Kurze Antwort: wenig Nachdenken reicht zum Abschreiben von Feldern
      output_config: { effort: "low", format: { type: "json_schema", schema: KI_SCHEMA as unknown as Record<string, unknown> } },
      system: kiAnweisung(eigeneNamen),
      messages: [{ role: "user", content: [datei, { type: "text", text: "Lies diese Rechnung und trage die Felder ein." }] }],
    });
    // Nur Zahlen ins Protokoll, nie Inhalte der Rechnung
    console.info(`[ki-rechnung] ${konfig.modell}: ${antwort.usage.input_tokens} Token ein, ${antwort.usage.output_tokens} Token aus`);
    if (antwort.stop_reason === "refusal") {
      console.warn("[ki-rechnung] Die KI hat das Lesen abgelehnt.");
      return null;
    }
    const text = antwort.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    return felderAusKiAntwort(JSON.parse(text.text), eigeneNamen);
  } catch (fehler) {
    // Ein Ausfall der KI darf das Anlegen der Rechnung nie verhindern: Das Büro trägt die Felder dann von Hand ein.
    if (fehler instanceof Anthropic.APIError) console.error(`[ki-rechnung] Fehler ${fehler.status}: ${fehler.message}`);
    else console.error("[ki-rechnung] Die Antwort konnte nicht gelesen werden.");
    return null;
  }
}
