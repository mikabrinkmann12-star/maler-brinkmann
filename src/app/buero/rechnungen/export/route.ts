import { NextResponse } from "next/server";
import { requireBueroRecht } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { rechnungenLaden } from "@/lib/rechnung-daten";
import { SAMMEL_MAX_DATEIEN, rechnungFilterLesen } from "@/lib/rechnung-filter";
import { anzeigeStatus, rechnungenFiltern } from "@/lib/rechnung-liste";
import { createClient } from "@/lib/supabase/server";
import { zipErzeugen } from "@/lib/zip";

/** Höchstgröße je Download (Vercel begrenzt die Antwort einer Funktion auf rund 4,5 MB) */
const MAX_BYTES = 4_200_000;

/**
 * Sammel-Download aller Rechnungsdateien, die zu den Filtern der Liste passen (dieselben Adressparameter wie die Liste), als ZIP.
 * Die Dateien sind die Kopien der Buchhaltung, die App erzeugt nichts selbst. Route Handler brauchen eine eigene Rollenprüfung.
 */
export async function GET(anfrage: Request) {
  await requireBueroRecht("rechnungen");
  const filter = rechnungFilterLesen(new URL(anfrage.url).searchParams);
  const heute = heuteIso();

  const { zeilen: alle } = await rechnungenLaden({ q: filter.q, archiv: filter.archiv, limit: 1000 });
  const zeilen = rechnungenFiltern(
    alle.map((z) => ({ ...z, anzeige: anzeigeStatus(z, heute) })),
    { von: filter.zeitraum?.von, bis: filter.zeitraum?.bis, status: filter.status, projektIds: filter.projektIds },
  ).filter((z) => z.pdfPfad);

  if (!zeilen.length) return new NextResponse("Keine Rechnung mit Datei zu diesen Filtern.", { status: 404 });
  if (zeilen.length > SAMMEL_MAX_DATEIEN) {
    return new NextResponse(`Das sind ${zeilen.length} Dateien, höchstens ${SAMMEL_MAX_DATEIEN} gehen auf einmal. Grenze den Zeitraum oder die Filter ein.`, { status: 413 });
  }

  const supabase = await createClient();
  const dateien: { name: string; inhalt: Uint8Array }[] = [];
  const benutzt = new Set<string>();
  let gesamt = 0;
  for (const z of zeilen) {
    const { data } = await supabase.storage.from("rechnungen").download(z.pdfPfad!);
    if (!data) continue;
    const inhalt = new Uint8Array(await data.arrayBuffer());
    gesamt += inhalt.length;
    if (gesamt > MAX_BYTES) return new NextResponse("Die Dateien sind zusammen zu groß. Grenze den Zeitraum oder die Filter ein.", { status: 413 });
    const endung = z.pdfPfad!.endsWith(".xml") ? "xml" : "pdf";
    const basis = `Rechnung_${z.rechnungsnummer.replace(/[^A-Za-z0-9_-]+/g, "_") || z.id.slice(0, 8)}`;
    let name = `${basis}.${endung}`;
    for (let n = 2; benutzt.has(name); n++) name = `${basis}_${n}.${endung}`;
    benutzt.add(name);
    dateien.push({ name, inhalt });
  }
  if (!dateien.length) return new NextResponse("Die Dateien konnten nicht geladen werden.", { status: 404 });

  return new NextResponse(new Uint8Array(zipErzeugen(dateien)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Rechnungen_${heute}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
