// Mahnschreiben (Zahlungserinnerung, 1. und 2. Mahnung) als PDF (A4) im Plancraft-Stil wie Angebot und Rechnung: Logo und Firmenblock rechts,
// Anschrift im Fenster, Titel mit Angaben-Zeile, Text (der gleiche wie in der E-Mail) und eine Aufstellung mit offenem Betrag, Gebühr, Zinsen und Frist.
// Läuft auf dem Server (pdf-lib).

import { PDFDocument } from "pdf-lib";
import type { Firma } from "@/lib/firma";
import { absenderZeile } from "@/lib/firma";
import { formatBetrag, formatDatum } from "@/lib/format";
import {
  GRAU, INHALT_B, RAND_L, RAND_R, SCHRIFT, SEITE_B, UNTEN, ZEILE, Zeichner,
  anschriftFeldZeichnen, bandZeichnen, briefKopfZeichnen, folgeKopfZeichnen, fussZeilenZeichnen, logoEinbetten, titelUndAngabenZeichnen,
} from "@/lib/pdf-zeichner";

export type MahnungPdfDaten = {
  firma: Firma;
  logo?: Uint8Array;
  empfaenger: string;
  kundennummer: string;
  /** „Zahlungserinnerung“, „1. Mahnung“ oder „2. Mahnung“ */
  stufeName: string;
  datum: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  betreff: string;
  /** Frist für die Zahlung (JJJJ-MM-TT), leer = sofort */
  frist: string;
  text: string;
  betraege: { offen: number; gebuehr: number; zinsen: number; summe: number };
  zinsenProzent: number;
  tageUeberfaellig: number;
};

export async function mahnungPdf(d: MahnungPdfDaten): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.stufeName} zur Rechnung ${d.rechnungsnummer}`.slice(0, 200));
  doc.setProducer("Maler Brinkmann");
  doc.setCreator("Maler Brinkmann");
  const z = new Zeichner(doc);
  await z.laden();
  const logo = await logoEinbetten(z, d.logo);
  const titel = `${d.stufeName} - ${d.rechnungsnummer}`;
  const folge = () => { z.neueSeite(); folgeKopfZeichnen(z, titel, d.betreff, `vom ${formatDatum(d.datum)}`, logo); };

  // Seite 1 wie Angebot und Rechnung: Logo und Firmenblock rechts, Anschrift im Fenster, Titel und Angaben-Zeile
  z.neueSeite();
  const blockUnten = briefKopfZeichnen(z, d.firma, logo);
  anschriftFeldZeichnen(z, absenderZeile(d.firma), d.empfaenger);
  titelUndAngabenZeichnen(z, titel, Math.min(522, blockUnten - 14), [
    ["Kunde", d.kundennummer],
    ["Rechnung", d.rechnungsnummer],
    ["Rechnungsdatum", formatDatum(d.rechnungsdatum)],
    ["Datum", formatDatum(d.datum)],
  ], { label: "Betreff", text: d.betreff });

  // Text (der gleiche wie in der E-Mail)
  z.y -= 8;
  for (const absatz of d.text.replace(/\r/g, "").split("\n")) {
    if (!absatz.trim()) { z.y -= 6; continue; }
    for (const zeile of z.umbrechen(absatz, z.regular, SCHRIFT, INHALT_B)) {
      if (z.y < UNTEN + ZEILE) folge();
      z.text(zeile, RAND_L, z.y);
      z.y -= ZEILE;
    }
  }
  z.y -= 18;

  // Aufstellung wie die Summen der Rechnung: graues Band, Zeilen, „Zu zahlen“ fett
  const zeilen: [string, number][] = [["Offener Rechnungsbetrag", d.betraege.offen]];
  if (d.betraege.gebuehr > 0) zeilen.push(["Mahngebühr", d.betraege.gebuehr]);
  if (d.betraege.zinsen > 0) zeilen.push([`Verzugszinsen (${String(d.zinsenProzent).replace(".", ",")} % p. a., ${d.tageUeberfaellig} Tage)`, d.betraege.zinsen]);
  if (z.y < UNTEN + 60 + zeilen.length * 15) folge();
  bandZeichnen(z, "Aufstellung", "Betrag");
  const rechts = SEITE_B - RAND_R - 6;
  for (const [label, wert] of zeilen) {
    z.text(label, RAND_L + 6, z.y);
    z.text(formatBetrag(wert), rechts, z.y, { rechts: true });
    z.y -= 15;
  }
  z.linie(RAND_L, z.y + 10, SEITE_B - RAND_R, z.y + 10, 0.8, GRAU);
  z.y -= 4;
  z.text("Zu zahlen", RAND_L + 6, z.y, { font: z.bold, groesse: 10.5 });
  z.text(formatBetrag(d.betraege.summe), rechts, z.y, { font: z.bold, groesse: 10.5, rechts: true });
  z.y -= 26;

  const hinweis = d.frist
    ? `Bitte zahlen Sie bis zum ${formatDatum(d.frist)} unter Angabe der Rechnungsnummer ${d.rechnungsnummer}.`
    : `Bitte zahlen Sie umgehend unter Angabe der Rechnungsnummer ${d.rechnungsnummer}.`;
  for (const zeile of z.umbrechen(hinweis, z.bold, SCHRIFT, INHALT_B)) {
    if (z.y < UNTEN + ZEILE) folge();
    z.text(zeile, RAND_L, z.y, { font: z.bold });
    z.y -= ZEILE;
  }

  fussZeilenZeichnen(z, d.firma);
  return doc.save();
}
