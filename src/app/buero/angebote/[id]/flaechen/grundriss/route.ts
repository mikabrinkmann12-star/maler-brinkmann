import { NextResponse } from "next/server";
import { requireBueroRecht } from "@/lib/auth";
import { raumArtVorschlag, sockelVorschlag } from "@/lib/flaechen";
import type { GrundrissErgebnis, Raum } from "@/lib/flaechen-typen";
import { grundrissLesen } from "@/lib/grundriss-lesen";

// Grundriss (PDF) lesen und die gefundenen Räume ungeprüft zurückgeben. Speichert nichts.
// Eigene Route statt Server-Aktion, weil Server-Aktionen ohne Änderung an next.config.ts nur 1 MB annehmen.
// Höchstens ca. 4 MB (Grenze der Vercel-Funktionen).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PDF = 4_000_000;

export type GrundrissAntwort = { fehler?: string; raeume?: Raum[]; verfahren?: GrundrissErgebnis["verfahren"]; hinweis?: string };

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
  if (!(datei instanceof File) || datei.size === 0) return antwort({ fehler: "Bitte einen Grundriss als PDF auswählen." }, 400);
  if (datei.size > MAX_PDF) return antwort({ fehler: "Die Datei ist zu groß (höchstens 4 MB)." }, 400);
  const bytes = new Uint8Array(await datei.arrayBuffer());
  // Eine PDF-Datei beginnt mit „%PDF“
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return antwort({ fehler: "Bitte eine PDF-Datei verwenden." }, 400);

  const ergebnis = await grundrissLesen(bytes);
  const raeume: Raum[] = ergebnis.raeume.map((r) => {
    const art = raumArtVorschlag(r.name);
    return { ...r, id: crypto.randomUUID(), art, sockel: r.belag && sockelVorschlag(art), geprueft: false };
  });
  return antwort({ raeume, verfahren: ergebnis.verfahren, hinweis: ergebnis.hinweis });
}
