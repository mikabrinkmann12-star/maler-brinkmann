import { NextResponse } from "next/server";
import { requireBueroRecht } from "@/lib/auth";
import { sockelVorschlag } from "@/lib/flaechen";
import type { GrundrissErgebnis, Raum } from "@/lib/flaechen-typen";
import { grundrissMedium } from "@/lib/grundriss-ki";
import { grundrissLesen } from "@/lib/grundriss-lesen";

// Grundriss (PDF oder Foto) mit der Claude API lesen und die Räume zurückgeben. Speichert nichts.
// Eigene Route statt Server-Aktion, weil Server-Aktionen ohne Änderung an next.config.ts nur 1 MB annehmen.
// Höchstens ca. 4 MB (Grenze der Vercel-Funktionen).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PDF = 4_000_000;

export type GrundrissAntwort = { fehler?: string; raeume?: Raum[]; tokens?: GrundrissErgebnis["tokens"] };

const antwort = (a: GrundrissAntwort, status = 200) => NextResponse.json(a, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(anfrage: Request, { params }: RouteContext<"/buero/angebote/[id]/flaechen/grundriss">) {
  await requireBueroRecht("angebote");
  const { id } = await params;
  if (!UUID.test(id)) return antwort({ fehler: "Ungültiges Angebot." }, 400);

  let datei: FormDataEntryValue | null;
  try {
    datei = (await anfrage.formData()).get("datei");
  } catch {
    return antwort({ fehler: "Die Datei ist nicht angekommen. Bitte nochmal versuchen (höchstens 4 MB)." }, 400);
  }
  if (!(datei instanceof File) || datei.size === 0) return antwort({ fehler: "Bitte einen Grundriss als PDF oder Foto auswählen." }, 400);
  if (datei.size > MAX_PDF) return antwort({ fehler: "Die Datei ist zu groß (höchstens 4 MB)." }, 400);
  const bytes = new Uint8Array(await datei.arrayBuffer());
  // Dateiart an den ersten Bytes erkennen: PDF, JPG, PNG oder WebP
  const medium = grundrissMedium(bytes);
  if (!medium) return antwort({ fehler: "Bitte ein PDF oder ein Foto (JPG, PNG) verwenden." }, 400);

  const ergebnis = await grundrissLesen(bytes, medium);
  if (ergebnis.fehler) return antwort({ fehler: ergebnis.fehler, tokens: ergebnis.tokens });
  const raeume: Raum[] = ergebnis.raeume.map((r) => ({ ...r, id: crypto.randomUUID(), umfang: null, hoehe: null, decke: null, sockel: sockelVorschlag(r.art) }));
  return antwort({ raeume, tokens: ergebnis.tokens });
}
