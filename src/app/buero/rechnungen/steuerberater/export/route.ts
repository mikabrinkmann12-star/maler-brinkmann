import { NextResponse } from "next/server";
import { requireBueroRecht } from "@/lib/auth";
import { eRechnungFuer } from "@/lib/e-rechnung-daten";
import { datevEinstellungenLaden, debitorenLaden, exportRechnungenLaden } from "@/lib/steuerberater-daten";
import { ZIP_TEIL_GROESSE, datevCsv, debitorenCsv, inTeile, journalCsv, zeitraumLesen } from "@/lib/steuerberater-export";
import { createClient } from "@/lib/supabase/server";
import { zipErzeugen } from "@/lib/zip";

const MAX_BYTES = 4_200_000;

const kopf = (typ: string, name: string) => ({ "Content-Type": typ, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" });

/**
 * Export für den Steuerberater (nur Büro/Admin): `typ=journal` (CSV für Excel), `typ=datev` (Buchungsstapel im DATEV-Format, Windows-1252)
 * oder `typ=zip&teil=N` (Rechnungs-PDFs und E-Rechnungs-XML, in Teilen). Route Handler brauchen eine eigene Rollenprüfung.
 */
export async function GET(anfrage: Request) {
  await requireBueroRecht("rechnungen");
  const p = new URL(anfrage.url).searchParams;
  const zeitraum = zeitraumLesen(p.get("von"), p.get("bis"));
  if (!zeitraum) return new NextResponse("Bitte einen gültigen Zeitraum angeben (höchstens drei Jahre).", { status: 400 });
  const typ = p.get("typ") ?? "journal";
  const name = `Rechnungen_${zeitraum.von}_bis_${zeitraum.bis}`;

  // Kundenliste (Konten je Kunde) hängt nicht am Zeitraum
  if (typ === "debitoren") {
    const kunden = await debitorenLaden();
    if (!kunden.length) return new NextResponse("Es gibt noch keine Kunden mit Konto.", { status: 404 });
    return new NextResponse(Buffer.from(debitorenCsv(kunden, await datevEinstellungenLaden()), "latin1"), { headers: kopf("text/csv; charset=windows-1252", "EXTF_Debitoren_Kunden.csv") });
  }

  const zeilen = await exportRechnungenLaden(zeitraum);
  if (!zeilen.length) return new NextResponse("Im Zeitraum gibt es keine fertigen Rechnungen.", { status: 404 });

  if (typ === "journal") {
    return new NextResponse(`﻿${journalCsv(zeilen)}`, { headers: kopf("text/csv; charset=utf-8", `${name}_Journal.csv`) });
  }
  if (typ === "datev") {
    const einst = await datevEinstellungenLaden();
    // DATEV erwartet ANSI (Windows-1252); datevCsv hat Umlaute schon ersetzt, übrige Zeichen werden zu „?“
    return new NextResponse(Buffer.from(datevCsv(zeilen, einst, zeitraum), "latin1"), { headers: kopf("text/csv; charset=windows-1252", `EXTF_Buchungsstapel_${name}.csv`) });
  }
  if (typ !== "zip") return new NextResponse("Unbekannte Art des Exports.", { status: 400 });

  const mitDatei = zeilen.filter((z) => z.pdfPfad && !z.pdfPfad.endsWith(".xml"));
  const teile = inTeile(mitDatei, ZIP_TEIL_GROESSE);
  const teil = Math.max(1, Number(p.get("teil") ?? "1") || 1);
  if (!teile.length) return new NextResponse("Im Zeitraum gibt es keine Rechnungsdateien.", { status: 404 });
  if (teil > teile.length) return new NextResponse(`Es gibt nur ${teile.length} Teil(e).`, { status: 404 });

  const supabase = await createClient();
  const dateien: { name: string; inhalt: Uint8Array }[] = [];
  const benutzt = new Set<string>();
  let gesamt = 0;
  for (const z of teile[teil - 1]) {
    const { data } = await supabase.storage.from("rechnungen").download(z.pdfPfad!);
    if (!data) continue;
    const inhalt = new Uint8Array(await data.arrayBuffer());
    const basis = `${z.nummer.replace(/[^A-Za-z0-9_-]+/g, "_") || z.id.slice(0, 8)}`;
    let dateiname = `${basis}.pdf`;
    for (let n = 2; benutzt.has(dateiname); n++) dateiname = `${basis}_${n}.pdf`;
    benutzt.add(dateiname);
    dateien.push({ name: dateiname, inhalt });
    gesamt += inhalt.length;
    // Bei eigenen Rechnungen gehört das XML der E-Rechnung zum Beleg (E-Rechnungen sind im Original aufzubewahren)
    if (z.anbieter === "eigen") {
      const e = await eRechnungFuer(z.id);
      if (e) {
        const xml = new TextEncoder().encode(e.xml);
        dateien.push({ name: dateiname.replace(/\.pdf$/, ".xml"), inhalt: xml });
        gesamt += xml.length;
      }
    }
    if (gesamt > MAX_BYTES) return new NextResponse("Der Teil ist zu groß. Grenze den Zeitraum ein.", { status: 413 });
  }
  if (!dateien.length) return new NextResponse("Die Dateien konnten nicht geladen werden.", { status: 404 });
  return new NextResponse(new Uint8Array(zipErzeugen(dateien)), { headers: kopf("application/zip", `${name}_Teil${teil}von${teile.length}.zip`) });
}
