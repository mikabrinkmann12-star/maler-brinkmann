// Angebot als PDF (A4), im Aufbau des Plancraft-Angebots: Briefkopf mit Absenderzeile, Empfänger,
// Firmenblock rechts, Kunde/Projekt/Datum, Betreff, Anfangstext, Positionstabelle mit „Übertrag“ auf Folgeseiten,
// Summen, Schlusstext, Unterschriftsfeld und Fußzeile mit Steuer-, Bank- und Seitenangaben.
// Läuft auf dem Server (pdf-lib ist reines JavaScript, die Schriften sind eingebaut).

import { PDFDocument, type PDFFont, type PDFImage } from "pdf-lib";
import type { AngebotStatus, Berechnung, BerechneteZeile } from "@/lib/angebot";
import { absenderZeile, type Firma } from "@/lib/firma";
import { formatDatum, formatZahl } from "@/lib/format";
import {
  GRAU, INHALT_B, KOPF_OBEN, LINIE, RAND_L, RAND_R, SCHRIFT, SCHWARZ, SEITE_B, SEITE_H, UNTEN, ZEILE, HELLGRAU,
  Zeichner, firmenKopfZeichnen, fussZeilenZeichnen,
} from "@/lib/pdf-zeichner";

export type AngebotPdfDaten = {
  firma: Firma;
  status: AngebotStatus;
  datum: string;
  betreff: string;
  leistungsort: string;
  empfaenger: string;
  einleitung: string;
  schlusstext: string;
  kundennummer: string;
  projektnummer: string;
  berechnung: Berechnung;
  reverseChargeText: string;
  /** JPEG-Bytes der Bild-Bausteine (Schlüssel = Baustein-ID) */
  bilder: Record<string, Uint8Array>;
  /** Firmenlogo (PNG oder JPEG), erscheint oben links im Briefkopf */
  logo?: Uint8Array;
  /** Satz zu Zahlungsziel und Skonto, z. B. „Zahlbar innerhalb von 14 Tagen netto“; leer = keine Angabe */
  zahlungsbedingung?: string;
  /** Gültig bis (JJJJ-MM-TT); leer = keine Angabe */
  gueltigBis?: string;
};

// Spalten der Tabelle
const SPALTE = {
  pos: { x: RAND_L, b: 34 },
  menge: { x: RAND_L + 34, b: 54 }, // rechtsbündig
  einheit: { x: RAND_L + 34 + 54 + 6, b: 40 },
  text: { x: RAND_L + 34 + 54 + 6 + 40 + 6, b: 0 },
  preis: { x: 0, b: 58 }, // rechtsbündig
  gesamt: { x: 0, b: 66 }, // rechtsbündig
};
SPALTE.gesamt.x = SEITE_B - RAND_R - SPALTE.gesamt.b;
SPALTE.preis.x = SPALTE.gesamt.x - 4 - SPALTE.preis.b;
SPALTE.text.b = SPALTE.preis.x - 8 - SPALTE.text.x;

const zahl = (w: number, min = 2, max = 2) => formatZahl(w, { min, max });
const euro = (w: number) => `${zahl(w)} €`;

export async function angebotPdf(d: AngebotPdfDaten): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Angebot ${d.betreff}`.slice(0, 200));
  doc.setProducer("Maler Brinkmann");
  doc.setCreator("Maler Brinkmann");
  const z = new Zeichner(doc);
  await z.laden();

  const titel = d.status === "entwurf" ? "Angebot - Entwurf" : "Angebot";
  const bilder = new Map<string, PDFImage>();
  for (const [id, bytes] of Object.entries(d.bilder)) {
    try {
      bilder.set(id, await doc.embedJpg(bytes));
    } catch {
      // kaputtes Bild: wird weggelassen
    }
  }

  // ---------------------------------------------------------------------
  // Seite 1: Briefkopf
  // ---------------------------------------------------------------------
  z.neueSeite();
  const f = d.firma;
  await firmenKopfZeichnen(z, f, d.logo);

  // Anschriftfeld nach DIN 5008 Form B (Fensterbriefumschlag): 20 mm von links, 45 mm von oben, 85 × 45 mm.
  // Oben im Fenster die kleine Absenderzeile (Rücksendeangabe), darunter die Anschrift des Empfängers.
  const mm = (wert: number) => wert * 72 / 25.4;
  const ausOben = (wert: number) => SEITE_H - mm(wert);
  const fensterBreite = mm(85);
  const passend = (text: string, font: PDFFont, groesse: number, kleinste: number): { text: string; groesse: number } => {
    let g = groesse;
    while (g > kleinste && z.breite(text, font, g) > fensterBreite) g -= 0.5;
    let t = text;
    while (t.length > 1 && z.breite(t, font, g) > fensterBreite) t = t.slice(0, -1);
    return { text: t === text ? t : `${t.trimEnd()}…`, groesse: g };
  };
  const absender = absenderZeile(f);
  if (absender) {
    const a = passend(absender, z.regular, 7.5, 6);
    z.text(a.text, RAND_L, ausOben(48.6), { groesse: a.groesse, farbe: GRAU });
    z.linie(RAND_L, ausOben(50.2), RAND_L + fensterBreite, ausOben(50.2), 0.3, LINIE);
  }
  let ey = ausOben(65.5);
  for (const zeile of d.empfaenger.split("\n").map((t) => t.trim()).filter(Boolean)) {
    const a = passend(zeile, z.regular, 10, 7.5);
    z.text(a.text, RAND_L, ey, { groesse: a.groesse });
    ey -= 12.2;
  }

  // Falz- und Lochmarke am linken Rand (DIN 5008 Form B: 105 mm, 148,5 mm und 210 mm von oben)
  for (const [von, laenge] of [[105, 4], [148.5, 6], [210, 4]] as const) {
    z.linie(0, ausOben(von), mm(laenge), ausOben(von), 0.4, GRAU);
  }

  // Kunde / Projekt / Datum rechts neben dem Anschriftfeld, der Titel darunter (Betreffzone ab 98,5 mm)
  const infoY = ausOben(65.5);
  const spalten: [string, string][] = [["Kunde", d.kundennummer], ["Projekt", d.projektnummer], ["Datum", formatDatum(d.datum)]];
  const spaltenX = [355, 430, 495];
  spalten.forEach(([label, wert], i) => {
    z.text(label, spaltenX[i], infoY + 4, { font: z.bold, groesse: 8, farbe: GRAU });
    z.text(wert || "–", spaltenX[i], infoY - 9, { groesse: 9 });
  });
  const titelY = ausOben(100);
  z.text(titel, RAND_L, titelY, { font: z.bold, groesse: 15 });

  z.y = titelY - 32;
  z.text("Betreff", RAND_L, z.y, { font: z.bold });
  z.y -= ZEILE;
  for (const zeile of z.umbrechen(d.betreff, z.bold, 11, INHALT_B)) {
    z.text(zeile, RAND_L, z.y, { font: z.bold, groesse: 11 });
    z.y -= 14;
  }
  if (d.leistungsort.trim()) {
    z.y -= 6;
    z.text("Leistungsort", RAND_L, z.y, { font: z.bold });
    z.y -= ZEILE;
    for (const zeile of z.umbrechen(d.leistungsort, z.regular, SCHRIFT, INHALT_B)) {
      z.text(zeile, RAND_L, z.y);
      z.y -= ZEILE;
    }
  }
  if (d.einleitung.trim()) {
    z.y -= 10;
    for (const zeile of z.umbrechen(d.einleitung, z.regular, SCHRIFT, INHALT_B)) {
      if (z.y < UNTEN + ZEILE) { z.neueSeite(); folgekopf(z, titel, d); }
      z.text(zeile, RAND_L, z.y);
      z.y -= ZEILE;
    }
  }
  z.y -= 12;

  // ---------------------------------------------------------------------
  // Tabelle
  // ---------------------------------------------------------------------
  let summeBisher = 0; // Cent der Positionen bis zur aktuellen Stelle
  const tabellenKopf = () => {
    z.text("Pos.", SPALTE.pos.x, z.y, { font: z.bold, groesse: 8.5 });
    z.text("Menge", SPALTE.menge.x + SPALTE.menge.b, z.y, { font: z.bold, groesse: 8.5, rechts: true });
    z.text("Einheit", SPALTE.einheit.x, z.y, { font: z.bold, groesse: 8.5 });
    z.text("Beschreibung", SPALTE.text.x, z.y, { font: z.bold, groesse: 8.5 });
    z.text("Preis", SPALTE.preis.x + SPALTE.preis.b, z.y, { font: z.bold, groesse: 8.5, rechts: true });
    z.text("Gesamt", SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { font: z.bold, groesse: 8.5, rechts: true });
    z.linie(RAND_L, z.y - 4, SEITE_B - RAND_R, z.y - 4, 0.8, SCHWARZ);
    z.y -= 18;
  };
  const uebertrag = () => {
    if (summeBisher === 0) return;
    z.text("Übertrag:", SPALTE.preis.x + SPALTE.preis.b, z.y, { font: z.bold, rechts: true });
    z.text(zahl(summeBisher / 100), SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { font: z.bold, rechts: true });
    z.y -= ZEILE + 4;
  };
  const folgeseite = () => {
    z.neueSeite();
    folgekopf(z, titel, d);
    tabellenKopf();
    uebertrag();
  };
  /** Platz für `hoehe` Punkte schaffen, sonst neue Seite. */
  const platz = (hoehe: number) => {
    if (z.y - hoehe < UNTEN) folgeseite();
  };

  if (z.y - 60 < UNTEN) { z.neueSeite(); folgekopf(z, titel, d); }
  tabellenKopf();

  for (const zeile of d.berechnung.zeilen) {
    zeichneZeile(z, zeile, bilder, platz, folgeseite, () => summeBisher);
    if (zeile.baustein.typ === "position" && zeile.gesamt !== null) summeBisher += Math.round(zeile.gesamt * 100);
  }

  // ---------------------------------------------------------------------
  // Summen, Schlusstext, Unterschrift
  // ---------------------------------------------------------------------
  const b = d.berechnung;
  const summenZeilen: { label: string; wert: string; stark?: boolean }[] = [{ label: "Nettosumme", wert: euro(b.netto) }];
  if (b.rabattProzent > 0) {
    summenZeilen.push({ label: `Rabatt ${zahl(b.rabattProzent, 0, 2)} %`, wert: `-${euro(b.rabatt)}` });
    summenZeilen.push({ label: "Netto nach Rabatt", wert: euro(b.nettoNachRabatt) });
  }
  if (!b.reverseCharge && b.steuersatz > 0) {
    summenZeilen.push({ label: `Umsatzsteuer ${b.steuersatz} %`, wert: euro(b.ust) });
    summenZeilen.push({ label: "Gesamtsumme brutto", wert: euro(b.brutto), stark: true });
  }
  const hinweisZeilen = b.reverseCharge ? z.umbrechen(d.reverseChargeText, z.regular, 8.5, INHALT_B) : [];

  platz(summenZeilen.length * 15 + hinweisZeilen.length * 11 + 40);
  z.y -= 6;
  z.linie(SPALTE.preis.x - 70, z.y + 10, SEITE_B - RAND_R, z.y + 10, 0.8, SCHWARZ);
  for (const s of summenZeilen) {
    const font = s.stark ? z.bold : z.regular;
    z.text(s.label, SPALTE.gesamt.x - 6, z.y, { font, rechts: true });
    z.text(s.wert, SEITE_B - RAND_R, z.y, { font, rechts: true });
    z.y -= 15;
  }
  if (hinweisZeilen.length) {
    z.y -= 4;
    for (const zeile of hinweisZeilen) {
      z.text(zeile, RAND_L, z.y, { groesse: 8.5 });
      z.y -= 11;
    }
  }

  // Zahlungsbedingungen und Gültigkeit direkt unter den Summen
  const bedingungen: string[] = [];
  if (d.zahlungsbedingung?.trim()) bedingungen.push(`Zahlungsbedingungen: ${d.zahlungsbedingung.trim()}.`);
  if (d.gueltigBis?.trim()) bedingungen.push(`Dieses Angebot ist gültig bis ${formatDatum(d.gueltigBis)}.`);
  if (bedingungen.length) {
    z.y -= 10;
    for (const satz of bedingungen) {
      for (const zeile of z.umbrechen(satz, z.regular, SCHRIFT, INHALT_B)) {
        if (z.y < UNTEN + ZEILE) { z.neueSeite(); folgekopf(z, titel, d); }
        z.text(zeile, RAND_L, z.y);
        z.y -= ZEILE;
      }
    }
  }

  z.y -= 14;
  const schluss = d.schlusstext.trim() ? z.umbrechen(d.schlusstext, z.regular, SCHRIFT, INHALT_B) : [];
  // Unterschriftsblock zusammenhalten
  platz(Math.min(schluss.length, 3) * ZEILE + 90);
  for (const zeile of schluss) {
    if (z.y < UNTEN + 80) { z.neueSeite(); folgekopf(z, titel, d); }
    z.text(zeile, RAND_L, z.y);
    z.y -= ZEILE;
  }
  z.y -= 8;
  if (z.y < UNTEN + 70) { z.neueSeite(); folgekopf(z, titel, d); }
  z.text("Mit dem Angebot bin ich einverstanden.", RAND_L, z.y);
  z.y -= 44;
  z.linie(RAND_L, z.y, RAND_L + 220, z.y, 0.6, SCHWARZ);
  z.text("Ort, Datum, Unterschrift Auftraggeber", RAND_L, z.y - 11, { groesse: 8.5 });

  // ---------------------------------------------------------------------
  // Fußzeile auf jeder Seite
  // ---------------------------------------------------------------------
  fussZeilenZeichnen(z, f);

  return doc.save();
}

/** Kopf der Folgeseiten: Titel, Betreff, Datum. */
function folgekopf(z: Zeichner, titel: string, d: AngebotPdfDaten) {
  z.text(titel, RAND_L, KOPF_OBEN, { font: z.bold, groesse: 12 });
  z.text(`vom ${formatDatum(d.datum)}`, SEITE_B - RAND_R, KOPF_OBEN, { rechts: true, farbe: GRAU });
  const betreff = z.umbrechen(d.betreff, z.regular, SCHRIFT, INHALT_B - 90)[0] ?? "";
  z.text(betreff, RAND_L, KOPF_OBEN - 15, { farbe: GRAU });
  z.y = KOPF_OBEN - 44;
}

/** Eine Zeile der Tabelle zeichnen (Position, Titel, Text, Zwischensumme oder Bild). */
function zeichneZeile(
  z: Zeichner,
  zeile: BerechneteZeile,
  bilder: Map<string, PDFImage>,
  platz: (hoehe: number) => void,
  folgeseite: () => void,
  summeBisher: () => number,
) {
  void summeBisher;
  const b = zeile.baustein;

  if (b.typ === "titel") {
    platz(34);
    z.y -= 4;
    z.seite.drawRectangle({ x: RAND_L, y: z.y - 4, width: INHALT_B, height: 16, color: HELLGRAU });
    z.text(zeile.nummer, SPALTE.pos.x + 2, z.y, { font: z.bold, groesse: 10 });
    z.text(b.kurztext, SPALTE.menge.x, z.y, { font: z.bold, groesse: 10 });
    z.y -= 22;
    return;
  }

  if (b.typ === "zwischensumme") {
    platz(30);
    z.linie(SPALTE.preis.x - 60, z.y + 9, SEITE_B - RAND_R, z.y + 9, 0.5, SCHWARZ);
    z.text("Zwischensumme:", SPALTE.preis.x + SPALTE.preis.b, z.y, { font: z.bold, rechts: true });
    z.text(zahl(zeile.zwischensumme ?? 0), SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { font: z.bold, rechts: true });
    z.y -= 22;
    return;
  }

  if (b.typ === "bild") {
    const bild = bilder.get(b.id);
    if (!bild) return;
    const maxB = Math.min(300, INHALT_B - 34);
    const maxH = 230;
    const faktor = Math.min(maxB / bild.width, maxH / bild.height, 1);
    const w = bild.width * faktor;
    const h = bild.height * faktor;
    const unterschrift = b.kurztext ? z.umbrechen(b.kurztext, z.kursiv, 8.5, maxB) : [];
    platz(h + unterschrift.length * 11 + 16);
    z.seite.drawImage(bild, { x: SPALTE.menge.x, y: z.y - h + 6, width: w, height: h });
    z.y -= h + 4;
    for (const t of unterschrift) {
      z.text(t, SPALTE.menge.x, z.y, { font: z.kursiv, groesse: 8.5, farbe: GRAU });
      z.y -= 11;
    }
    z.y -= 8;
    return;
  }

  // Text und Position: Beschreibung umbrechen
  const volleBreite = b.typ === "text";
  const textX = volleBreite ? SPALTE.menge.x : SPALTE.text.x;
  const textB = volleBreite ? SEITE_B - RAND_R - textX : SPALTE.text.b;
  const zeilen: { t: string; bold: boolean }[] = [];
  // Mit Langtext ist der Kurztext die fette Überschrift, sonst steht der Text normal (wie in Plancraft).
  const kurzFett = b.langtext.trim() !== "";
  if (b.kurztext.trim()) for (const t of z.umbrechen(b.kurztext, kurzFett ? z.bold : z.regular, SCHRIFT, textB)) zeilen.push({ t, bold: kurzFett });
  if (b.langtext.trim()) for (const t of z.umbrechen(b.langtext, z.regular, SCHRIFT, textB)) zeilen.push({ t, bold: false });
  if (zeilen.length === 0) zeilen.push({ t: "", bold: false });

  const hoehe = zeilen.length * ZEILE + 8;
  if (hoehe < 330) platz(hoehe);

  let erste = true;
  for (const [i, l] of zeilen.entries()) {
    if (z.y < UNTEN + ZEILE) {
      folgeseite();
      erste = false; // Nummer und Preise stehen nur in der ersten Zeile
    }
    if (i === 0 && erste) {
      z.text(zeile.nummer, SPALTE.pos.x, z.y);
      if (b.typ === "position") {
        z.text(zahl(b.menge ?? 0, 2, 3), SPALTE.menge.x + SPALTE.menge.b, z.y, { rechts: true });
        z.text(b.einheit, SPALTE.einheit.x, z.y);
        z.text(zahl(b.einzelpreis ?? 0), SPALTE.preis.x + SPALTE.preis.b, z.y, { rechts: true });
        z.text(zahl(zeile.gesamt ?? 0), SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { rechts: true });
      }
    }
    z.text(l.t, textX, z.y, { font: l.bold ? z.bold : z.regular });
    z.y -= ZEILE;
  }
  z.y -= 8;
}
