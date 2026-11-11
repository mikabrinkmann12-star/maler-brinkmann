import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { GrundrissErgebnis } from "@/lib/flaechen-typen";
import { grundrissLesenMit, type GrundrissAntwort, type GrundrissMedium } from "@/lib/grundriss-ki";

// Liest die Räume eines Grundriss-PDFs mit der Claude-Schnittstelle (Anthropic). Das PDF geht an den Dienst, sobald
// `ANTHROPIC_API_KEY` gesetzt ist (lokal `.env.local`, online Vercel). Andere Schalter (z. B. `KI_RECHNUNG_AKTIV`) gelten hier nicht.
// Modell und Aufwand stehen in `grundriss-ki.ts`. Das Ergebnis ist immer ungeprüft; das Büro prüft jeden Raum.
// Absicherung gegen Ablehnungen: serverseitige Fallback-Kette (Beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`).

export async function grundrissLesen(bytes: Uint8Array, medium: GrundrissMedium = "application/pdf"): Promise<GrundrissErgebnis> {
  const schluessel = process.env.ANTHROPIC_API_KEY;
  let client: Anthropic | null = null;

  return grundrissLesenMit(bytes, schluessel, async (anfrage): Promise<GrundrissAntwort> => {
    client ??= new Anthropic({ apiKey: schluessel, maxRetries: 1, timeout: 120_000 });
    const antwort = await client.beta.messages.create({
      ...anfrage,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    return {
      model: antwort.model,
      stop_reason: antwort.stop_reason,
      content: antwort.content.map((b) => (b.type === "text" ? { type: "text", text: b.text } : { type: b.type })),
      usage: { input_tokens: antwort.usage.input_tokens, output_tokens: antwort.usage.output_tokens },
    };
  }, medium);
}
