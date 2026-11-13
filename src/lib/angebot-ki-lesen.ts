import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { MAX_KATALOG, angebotKiVorschlagenMit, type AngebotKiErgebnis, type KatalogLeistung } from "@/lib/angebot-ki";
import { apiFehlerText } from "@/lib/grundriss-ki";
import { createClient } from "@/lib/supabase/server";

// KI-Assistent im Angebot: lädt die aktiven Leistungen (mit den Rechten des Nutzers) und fragt Claude.
// An den Dienst gehen nur die Beschreibung und Name/Nummer/Einheit der Leistungen, keine Preise und keine Kundendaten.
// Läuft, sobald `ANTHROPIC_API_KEY` gesetzt ist (lokal `.env.local`, online Vercel). Absicherung gegen Ablehnungen wie beim Grundriss.

export async function angebotKiVorschlagen(beschreibung: string): Promise<AngebotKiErgebnis> {
  const schluessel = process.env.ANTHROPIC_API_KEY;
  if (!schluessel?.trim()) return { ok: false, fehler: "Der KI-Assistent ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt)." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("services").select("id, name, einheit, nummer").is("archiviert_am", null).order("nummer", { nullsFirst: false }).order("name").limit(MAX_KATALOG);
  if (error) return { ok: false, fehler: "Die Leistungen konnten nicht geladen werden." };
  const katalog: KatalogLeistung[] = data ?? [];

  const client = new Anthropic({ apiKey: schluessel, maxRetries: 1, timeout: 90_000 });
  return angebotKiVorschlagenMit(beschreibung, katalog, async (anfrage) => {
    const antwort = await client.beta.messages.create({ ...anfrage, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    return {
      model: antwort.model,
      stop_reason: antwort.stop_reason,
      content: antwort.content.map((b) => (b.type === "text" ? { type: "text", text: b.text } : { type: b.type })),
      usage: { input_tokens: antwort.usage.input_tokens, output_tokens: antwort.usage.output_tokens },
    };
  }, apiFehlerText);
}
