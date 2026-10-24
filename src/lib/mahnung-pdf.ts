// Mahnschreiben (Zahlungserinnerung, 1. und 2. Mahnung) als PDF (A4): Briefkopf wie bei der Rechnung, Anschrift im Fenster, Bezug zur Rechnung,
// Text (der gleiche wie in der E-Mail) und eine Übersicht mit offenem Betrag, Gebühr, Zinsen und Frist. Läuft auf dem Server (pdf-lib).

import { PDFDocument } from "pdf-lib";
import type { Firma } from "@/lib/firma";
import { absenderZeile } from "@/lib/firma";
import { formatBetrag, formatDatum } from "@/lib/format";
import { GRAU, INHALT_B, LINIE, RAND_L, SCHRIFT, SEITE_B, SEITE_H, UNTEN, ZEILE, Zeichner, firmenKopfZeichnen, fussZeilenZeichnen } from "@/lib/pdf-zeichner";

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
  z.neueSeite();
  await firmenKopfZeichnen(z, d.firma, d.logo);

  // Anschriftfeld nach DIN 5008 Form B (wie beim Angebot)
  const mm = (w: number) => (w * 72) / 25.4;
  const ausOben = (w: number) => SEITE_H - mm(w);
  const breite = mm(85);
  const absender = absenderZeile(d.firma);
  if (absender) {
    z.text(absender.length > 70 ? `${absender.slice(0, 69)}…` : absender, RAND_L, ausOben(48.6), { groesse: 7.5, farbe: GRAU });
    z.linie(RAND_L, ausOben(50.2), RAND_L + breite, ausOben(50.2), 0.3, LINIE);
  }
  let ey = ausOben(65.5);
  for (const zeile of d.empfaenger.split("\n").map((t) => t.trim()).filter(Boolean)) {
    z.text(zeile, RAND_L, ey, { groesse: 10 });
    ey -= 12.2;
  }
  for (const [von, laenge] of [[105, 4], [148.5, 6], [210, 4]] as const) z.linie(0, ausOben(von), mm(laenge), ausOben(von), 0.4, GRAU);

  const infoY = ausOben(65.5);
  [["Kunde", d.kundennummer], ["Rechnungsnr.", d.rechnungsnummer], ["Datum", formatDatum(d.datum)]].forEach(([label, wert], i) => {
    const x = [355, 430, 495][i];
    z.text(label, x, infoY + 4, { font: z.bold, groesse: 8, farbe: GRAU });
    z.text(wert || "–", x, infoY - 9, { groesse: 9 });
  });

  const titelY = ausOben(100);
  z.text(d.stufeName, RAND_L, titelY, { font: z.bold, groesse: 15 });
  z.y = titelY - 28;
  z.text(`Rechnung ${d.rechnungsnummer} vom ${formatDatum(d.rechnungsdatum)}`, RAND_L, z.y, { font: z.bold, groesse: 11 });
  z.y -= 14;
  for (const zeile of z.umbrechen(d.betreff, z.regular, SCHRIFT, INHALT_B)) {
    z.text(zeile, RAND_L, z.y, { farbe: GRAU });
    z.y -= ZEILE;
  }
  z.y -= 14;

  for (const zeile of z.umbrechen(d.text, z.regular, SCHRIFT + 0.5, INHALT_B)) {
    if (z.y < UNTEN + ZEILE * 12) { z.neueSeite(); z.y = 760; }
    z.text(zeile, RAND_L, z.y, { groesse: SCHRIFT + 0.5 });
    z.y -= ZEILE + 1;
  }
  z.y -= 12;

  // Übersicht
  if (z.y < UNTEN + 130) { z.neueSeite(); z.y = 760; }
  const rechts = SEITE_B - 56.7;
  const zeile = (label: string, wert: string, stark = false) => {
    z.text(label, RAND_L + 200, z.y, { font: stark ? z.bold : z.regular });
    z.text(wert, rechts, z.y, { font: stark ? z.bold : z.regular, rechts: true });
    z.y -= ZEILE + 3;
  };
  z.linie(RAND_L + 200, z.y + 12, rechts, z.y + 12, 0.8, GRAU);
  zeile("Offener Rechnungsbetrag", formatBetrag(d.betraege.offen));
  if (d.betraege.gebuehr > 0) zeile("Mahngebühr", formatBetrag(d.betraege.gebuehr));
  if (d.betraege.zinsen > 0) zeile(`Verzugszinsen (${String(d.zinsenProzent).replace(".", ",")} % p. a., ${d.tageUeberfaellig} Tage)`, formatBetrag(d.betraege.zinsen));
  z.linie(RAND_L + 200, z.y + 12, rechts, z.y + 12, 0.8, GRAU);
  zeile("Zu zahlen", formatBetrag(d.betraege.summe), true);
  z.y -= 6;
  z.text(d.frist ? `Bitte zahlen Sie bis zum ${formatDatum(d.frist)} unter Angabe der Rechnungsnummer ${d.rechnungsnummer}.` : `Bitte zahlen Sie umgehend unter Angabe der Rechnungsnummer ${d.rechnungsnummer}.`, RAND_L, z.y);

  fussZeilenZeichnen(z, d.firma);
  return doc.save();
}
