// Angebot und Rechnung als PDF (A4), Layout wie Plancraft (Vorlage: Angebot A-2400856 und Schlussrechnung R-(24)22385, Mika 11.11.2026):
// Logo oben rechts, Firmenblock darunter, Absenderzeile und Empfänger links, Titel „Angebot“ bzw. „Rechnung - Nr.“, Angaben in einer Zeile
// (Betreff fett links; Kunde, Projekt, ggf. Leistungszeitraum, Datum rechts), Tabelle mit grauer Kopfzeile, Titeln und „Summe …“,
// Summenblock rechts, Zahlungsaufstellung bei Schlussrechnungen, Schlusstext, Unterschrift, Übersicht der Titel und Fußzeile.
// Läuft auf dem Server (pdf-lib ist reines JavaScript, die Schriften sind eingebaut).

import { PDFDocument, degrees, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import type { AngebotStatus, Berechnung, BerechneteZeile } from "@/lib/angebot";
import { RECHNUNGS_ART_NAMEN, type RechnungsArt } from "@/lib/rechnung";
import { RECHNUNG_ART, dokumentTitel, dokumentartInfo } from "@/lib/dokumentart";
import { absenderZeile, type Firma } from "@/lib/firma";
import { formatDatum, formatZahl } from "@/lib/format";
import {
  INHALT_B, KOPF_OBEN, LINIE, RAND_L, RAND_R, SCHRIFT, SCHWARZ, SEITE_B, SEITE_H, UNTEN, ZEILE,
  Zeichner, briefKopfZeichnen, fussZeilenZeichnen, logoEinbetten, logoZeichnen,
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
  /** Dokumentart (Angebot, Kostenvoranschlag, …); leer = Angebot */
  dokumentart?: string;
  nachtrag?: boolean;
  /** Ansprechperson im Briefkopf (z. B. wer das Angebot erstellt hat); leer = keine */
  ansprechperson?: { name: string; telefon?: string };
  /** Gesetzt = fertige Rechnung der App (Nummer, Leistungszeitraum, Fälligkeit); dann ist `status` „versendet“ und es steht kein „Entwurf“ im Titel */
  rechnung?: {
    nummer: string;
    leistungVon: string;
    leistungBis: string;
    faelligAm: string;
    /** Rechnungsart; leer = normale Rechnung. Gutschrift und Storno zeigen negative Summen. */
    art?: RechnungsArt;
    /** Gutschrift und Storno: die Rechnung, auf die sie sich beziehen */
    bezug?: { nummer: string; datum: string };
    /** Schlussrechnung: abgezogene Abschlagsrechnungen */
    abschlaege?: { nummer: string; datum: string; netto: number; brutto: number }[];
    /** Schlussrechnung: noch zu zahlender Betrag brutto nach Abzug der Abschläge */
    zahlbetrag?: number;
    /** Satz zu den enthaltenen Lohnkosten (§ 35a EStG), steht unter den Zahlungsbedingungen */
    lohnHinweis?: string;
    /** Pflichthinweis zur Aufbewahrung bei Privatpersonen (§ 14 Abs. 4 Nr. 9 UStG) */
    aufbewahrungHinweis?: string;
    /** USt-IdNr. des Kunden, steht unter der Anschrift (bei Reverse-Charge, wie bei Plancraft) */
    kundeUstId?: string;
    /** Vorschau eines Entwurfs: Titel „… - Entwurf“, kein Zahlungssatz mit Rechnungsnummer, Wasserzeichen „ENTWURF“ */
    entwurf?: boolean;
  };
};

// Spalten der Tabelle
const SPALTE = {
  pos: { x: RAND_L + 4, b: 34 },
  menge: { x: RAND_L + 38, b: 52 }, // rechtsbündig
  einheit: { x: RAND_L + 38 + 52 + 5, b: 40 },
  text: { x: RAND_L + 38 + 52 + 5 + 40 + 6, b: 0 },
  preis: { x: 0, b: 50 }, // rechtsbündig
  gesamt: { x: 0, b: 62 }, // rechtsbündig
};
SPALTE.gesamt.x = SEITE_B - RAND_R - 4 - SPALTE.gesamt.b;
SPALTE.preis.x = SPALTE.gesamt.x - 6 - SPALTE.preis.b;
SPALTE.text.b = SPALTE.preis.x - 8 - SPALTE.text.x;

const KOPF_GRAU = rgb(0.9, 0.9, 0.9);
const zahl = (w: number, min = 2, max = 2) => formatZahl(w, { min, max });
const euro = (w: number) => `${zahl(w)} €`;
/** Positionsnummer mit Punkt am Ende wie Plancraft („1.1.“) */
const nr = (n: string) => (n && !n.endsWith(".") ? `${n}.` : n);

type Titel = { nummer: string; text: string; summe: number };

export async function angebotPdf(d: AngebotPdfDaten): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const art = d.rechnung ? RECHNUNG_ART : dokumentartInfo(d.dokumentart);
  doc.setTitle(`${d.rechnung ? RECHNUNGS_ART_NAMEN[d.rechnung.art ?? "rechnung"] : art.name}${d.rechnung ? ` ${d.rechnung.nummer}` : ""} ${d.betreff}`.slice(0, 200));
  doc.setProducer("Maler Brinkmann");
  doc.setCreator("Maler Brinkmann");
  const z = new Zeichner(doc);
  await z.laden();

  const rechnungsArt: RechnungsArt = d.rechnung?.art ?? "rechnung";
  const istGutschrift = rechnungsArt === "gutschrift" || rechnungsArt === "storno";
  const vz = istGutschrift ? -1 : 1;
  const titel = d.rechnung ? `${RECHNUNGS_ART_NAMEN[rechnungsArt]} - ${d.rechnung.nummer}` : dokumentTitel(d.dokumentart, d.nachtrag ?? false, d.status === "entwurf");
  const bilder = new Map<string, PDFImage>();
  for (const [id, bytes] of Object.entries(d.bilder)) {
    try {
      bilder.set(id, await doc.embedJpg(bytes));
    } catch {
      // kaputtes Bild: wird weggelassen
    }
  }
  const logo = await logoEinbetten(z, d.logo);
  const f = d.firma;
  const folge = () => { z.neueSeite(); folgekopf(z, titel, d, logo); };

  // ---------------------------------------------------------------------
  // Seite 1: Briefkopf
  // ---------------------------------------------------------------------
  z.neueSeite();
  const blockUnten = briefKopfZeichnen(z, f, logo, d.ansprechperson);

  // Anschriftfeld nach DIN 5008 Form B: oben die kleine fette Absenderzeile, darunter die Anschrift des Empfängers
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
    const a = passend(absender, z.bold, 6.5, 5.5);
    z.text(a.text, RAND_L, ausOben(56.4), { font: z.bold, groesse: a.groesse });
  }
  let ey = ausOben(62);
  for (const zeile of d.empfaenger.split("\n").map((t) => t.trim()).filter(Boolean)) {
    const a = passend(zeile, z.regular, SCHRIFT, 7.5);
    z.text(a.text, RAND_L, ey, { groesse: a.groesse });
    ey -= 11.7;
  }
  // USt-ID des Kunden (Reverse-Charge) wie bei Plancraft unten im Anschriftbereich
  if (d.rechnung?.kundeUstId) {
    const label = "USt.-ID: ";
    const yU = Math.min(ey - 14, ausOben(90.5));
    z.text(label, RAND_L, yU, { font: z.bold });
    z.text(d.rechnung.kundeUstId, RAND_L + z.breite(label, z.bold, SCHRIFT), yU);
  }
  // Falz- und Lochmarke am linken Rand (DIN 5008 Form B)
  for (const [von, laenge] of [[105, 4], [148.5, 6], [210, 4]] as const) z.linie(0, ausOben(von), mm(laenge), ausOben(von), 0.4, LINIE);

  // Titel und Angaben-Zeile
  z.y = Math.min(522, blockUnten - 14);
  z.text(titel, RAND_L, z.y, { font: z.bold, groesse: 13 });
  z.y -= 26;
  const r0 = d.rechnung;
  const leistung = r0
    ? (formatDatum(r0.leistungVon) === formatDatum(r0.leistungBis) ? formatDatum(r0.leistungVon) : `${formatDatum(r0.leistungVon)} - ${formatDatum(r0.leistungBis)}`)
    : "";
  const spalten: [string, string][] = [
    ["Kunde", d.kundennummer],
    ...(d.projektnummer.trim() ? [["Projekt", d.projektnummer] as [string, string]] : []),
    ...(r0 ? [["Leistungszeitraum", leistung] as [string, string]] : []),
    ["Datum", formatDatum(d.datum)],
  ];
  // Von rechts nach links setzen: die letzte Spalte (Datum) rechtsbündig, die anderen linksbündig mit Abstand
  let rechts = SEITE_B - RAND_R;
  const xs: number[] = [];
  for (let i = spalten.length - 1; i >= 0; i--) {
    const [label, wert] = spalten[i];
    const w = Math.max(z.breite(label, z.regular, SCHRIFT), z.breite(wert || "–", z.bold, SCHRIFT));
    const letzte = i === spalten.length - 1;
    xs[i] = letzte ? rechts : rechts - w;
    rechts = (letzte ? rechts - w : xs[i]) - 14;
  }
  spalten.forEach(([label, wert], i) => {
    const r = i === spalten.length - 1;
    z.text(label, xs[i], z.y, { rechts: r });
    z.text(wert || "–", xs[i], z.y - 11.7, { font: z.bold, rechts: r });
  });
  const betreffB = Math.max(120, rechts - RAND_L);
  z.text("Betreff", RAND_L, z.y);
  let by = z.y - 11.7;
  for (const zeile of z.umbrechen(d.betreff, z.bold, SCHRIFT, betreffB)) { z.text(zeile, RAND_L, by, { font: z.bold }); by -= 11.7; }
  z.y = Math.min(by, z.y - 23.4) - 8;
  const angabe = (label: string, wert: string) => {
    z.text(label, RAND_L, z.y);
    z.y -= 11.7;
    for (const zeile of z.umbrechen(wert, z.bold, SCHRIFT, INHALT_B)) { z.text(zeile, RAND_L, z.y, { font: z.bold }); z.y -= 11.7; }
    z.y -= 8;
  };
  if (d.leistungsort.trim()) angabe("Leistungsort", d.leistungsort);
  if (r0?.bezug) angabe("Bezug", `Rechnung ${r0.bezug.nummer} vom ${formatDatum(r0.bezug.datum)}`);

  // Anfangstext: Absätze mit etwas Abstand
  if (d.einleitung.trim()) {
    z.y -= 8;
    for (const absatz of d.einleitung.replace(/\r/g, "").split("\n")) {
      if (!absatz.trim()) continue;
      for (const zeile of z.umbrechen(absatz, z.regular, SCHRIFT, INHALT_B)) {
        if (z.y < UNTEN + ZEILE) folge();
        z.text(zeile, RAND_L, z.y);
        z.y -= ZEILE;
      }
      z.y -= 6;
    }
  }
  z.y -= 14;

  // ---------------------------------------------------------------------
  // Tabelle
  // ---------------------------------------------------------------------
  let summeBisher = 0; // Cent der Positionen bis zur aktuellen Stelle
  const titelListe: Titel[] = [];
  const kopfBand = () => z.seite.drawRectangle({ x: RAND_L, y: z.y - 6, width: INHALT_B, height: 19, color: KOPF_GRAU });
  const tabellenKopf = () => {
    kopfBand();
    z.text("Pos.", SPALTE.pos.x, z.y, { font: z.bold });
    z.text("Menge", SPALTE.menge.x + SPALTE.menge.b, z.y, { font: z.bold, rechts: true });
    z.text("Einheit", SPALTE.einheit.x, z.y, { font: z.bold });
    z.text("Beschreibung", SPALTE.text.x, z.y, { font: z.bold });
    if (art.preise) {
      z.text("Preis", SPALTE.preis.x + SPALTE.preis.b, z.y, { font: z.bold, rechts: true });
      z.text("Gesamt", SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { font: z.bold, rechts: true });
    }
    z.y -= 25;
  };
  const uebertrag = () => {
    if (summeBisher === 0 || !art.preise) return;
    z.text("Übertrag:", SPALTE.preis.x + SPALTE.preis.b + 6, z.y, { font: z.bold, rechts: true });
    z.text(zahl(summeBisher / 100), SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { font: z.bold, rechts: true });
    z.y -= ZEILE + 8;
  };
  const folgeseite = () => {
    folge();
    tabellenKopf();
    uebertrag();
  };
  /** Platz für `hoehe` Punkte schaffen, sonst neue Seite. */
  const platz = (hoehe: number) => {
    if (z.y - hoehe < UNTEN) folgeseite();
  };

  if (art.positionen) {
    if (z.y - 60 < UNTEN) folge();
    tabellenKopf();
    let aktTitel: Titel | null = null;
    for (const zeile of d.berechnung.zeilen) {
      if (zeile.baustein.typ === "titel") {
        aktTitel = { nummer: nr(zeile.nummer), text: zeile.baustein.kurztext, summe: 0 };
        titelListe.push(aktTitel);
      }
      zeichneZeile(z, zeile, bilder, platz, folgeseite, art.preise, aktTitel);
      if (zeile.baustein.typ === "position" && zeile.gesamt !== null) {
        summeBisher += Math.round(zeile.gesamt * 100);
        if (aktTitel) aktTitel.summe += zeile.gesamt;
      }
    }
  }

  // ---------------------------------------------------------------------
  // Summen (rechte Hälfte, wie Plancraft)
  // ---------------------------------------------------------------------
  const b = d.berechnung;
  const ev = (w: number) => euro(w * vz);
  type Summe = { label: string; wert: string; stark?: boolean; doppelLinie?: boolean };
  const summen: Summe[] = [{ label: istGutschrift ? "Nettosumme der Gutschrift" : "Nettosumme", wert: ev(b.netto), stark: true }];
  if (b.rabattProzent > 0) {
    summen.push({ label: `abzgl. ${zahl(b.rabattProzent, 0, 2)} % Rabatt`, wert: euro(-b.rabatt * vz) });
    summen.push({ label: "Netto nach Rabatt", wert: ev(b.nettoNachRabatt), stark: true });
  }
  if (!b.reverseCharge && b.steuersatz > 0) {
    summen.push({ label: `zzgl. ${zahl(b.steuersatz, 0, 1)} % USt`, wert: ev(b.ust) });
    summen.push({ label: istGutschrift ? "Gutschriftsbetrag brutto" : "Bruttosumme", wert: ev(b.brutto), stark: true, doppelLinie: true });
  }
  const mitSummen = art.preise && art.positionen;
  const summenX = RAND_L + INHALT_B * 0.5;
  if (mitSummen) {
    platz(summen.length * 18 + 30);
    z.y -= 10;
    for (const s of summen) {
      if (s.doppelLinie) {
        z.linie(summenX, z.y + 14, SEITE_B - RAND_R, z.y + 14, 0.4, LINIE);
        z.linie(summenX, z.y + 12, SEITE_B - RAND_R, z.y + 12, 0.4, LINIE);
        z.y -= 6;
      }
      const font = s.stark ? z.bold : z.regular;
      z.text(s.label, summenX, z.y, { font });
      z.text(s.wert, SEITE_B - RAND_R - 4, z.y, { font, rechts: true });
      z.y -= 18;
    }
  }

  // Schlussrechnung: Zahlungsaufstellung (Gesamtbetrag, abgezogene Abschläge, offene Forderung)
  const abschlaege = mitSummen && r0?.abschlaege?.length ? r0.abschlaege : [];
  if (abschlaege.length) {
    const netto = b.nettoNachRabatt;
    const brutto = b.brutto;
    const zeilen: [string, string, string, number, number][] = [["Gesamtbetrag", "", "-", netto, brutto]];
    for (const a of abschlaege) zeilen.push([`Abschlagsrechnung (${a.nummer})`, "Abschlag", a.datum ? formatDatum(a.datum) : "-", -a.netto, -a.brutto]);
    const offenBrutto = r0?.zahlbetrag ?? brutto - abschlaege.reduce((s, a) => s + a.brutto, 0);
    const offenNetto = netto - abschlaege.reduce((s, a) => s + a.netto, 0);
    platz(zeilen.length * 20 + 70);
    z.y -= 16;
    const sx = { art: RAND_L + 175, datum: RAND_L + 240, netto: RAND_L + 345, ust: RAND_L + 415, brutto: SEITE_B - RAND_R - 4 };
    kopfBand();
    z.text("Zahlungsaufstellung", RAND_L + 4, z.y, { font: z.bold });
    z.text("Art", sx.art, z.y, { font: z.bold });
    z.text("Datum", sx.datum, z.y, { font: z.bold });
    z.text("Netto", sx.netto, z.y, { font: z.bold, rechts: true });
    z.text("USt.", sx.ust, z.y, { font: z.bold, rechts: true });
    z.text("Brutto", sx.brutto, z.y, { font: z.bold, rechts: true });
    z.y -= 24;
    const satz = zahl(b.reverseCharge ? 0 : b.steuersatz, 0, 1);
    for (const [label, artText, datum, n, br] of zeilen) {
      z.text(label, RAND_L + 4, z.y);
      z.text(artText, sx.art, z.y);
      z.text(datum, sx.datum, z.y);
      z.text(zahl(n), sx.netto, z.y, { rechts: true });
      z.text(`${zahl(br - n)} (${satz} %)`, sx.ust, z.y, { rechts: true });
      z.text(zahl(br), sx.brutto, z.y, { rechts: true });
      z.y -= 20;
    }
    z.linie(RAND_L, z.y + 12, SEITE_B - RAND_R, z.y + 12, 0.4, LINIE);
    z.linie(RAND_L, z.y + 10, SEITE_B - RAND_R, z.y + 10, 0.4, LINIE);
    z.y -= 8;
    z.text("OFFENE FORDERUNG", RAND_L + 4, z.y, { font: z.bold });
    z.text(euro(offenNetto), sx.netto, z.y, { font: z.bold, rechts: true });
    z.text(euro(offenBrutto - offenNetto), sx.ust, z.y, { font: z.bold, rechts: true });
    z.text(euro(offenBrutto), sx.brutto, z.y, { font: z.bold, rechts: true });
    z.y -= 22;
  }

  // Reverse-Charge-Satz, Zahlungsbedingungen, Hinweise und Schlusstext als Absätze
  const absaetze: { text: string; fett?: boolean }[] = [];
  if (mitSummen && b.reverseCharge && d.reverseChargeText.trim()) absaetze.push({ text: d.reverseChargeText.trim() });
  if (mitSummen && d.zahlungsbedingung?.trim()) absaetze.push({ text: d.zahlungsbedingung.trim().replace(/\.*$/, ".") });
  if (r0 && istGutschrift) absaetze.push({ text: `Wir erstatten Ihnen den Betrag bzw. verrechnen ihn mit offenen Forderungen (${RECHNUNGS_ART_NAMEN[rechnungsArt]} ${r0.nummer}).` });
  else if (r0 && !r0.entwurf) absaetze.push({ text: `Bitte überweisen Sie ${abschlaege.length ? "die offene Forderung" : "den Betrag"} bis zum ${formatDatum(r0.faelligAm)} unter Angabe der Rechnungsnummer ${r0.nummer}.` });
  if (mitSummen && r0?.lohnHinweis) absaetze.push({ text: r0.lohnHinweis });
  if (r0?.aufbewahrungHinweis) absaetze.push({ text: r0.aufbewahrungHinweis });
  if (art.gueltig && d.gueltigBis?.trim()) absaetze.push({ text: art.gueltig.replace("{datum}", formatDatum(d.gueltigBis)) });
  // Schlusstext: jede Zeile ein Absatz; der Satz „maschinell erstellt …“ fett wie bei Plancraft
  for (const zeile of d.schlusstext.replace(/\r/g, "").split("\n")) {
    if (zeile.trim()) absaetze.push({ text: zeile.trim(), fett: /maschinell erstellt/i.test(zeile) });
  }
  z.y -= 10;
  for (const a of absaetze) {
    const zeilen = z.umbrechen(a.text, a.fett ? z.bold : z.regular, SCHRIFT, INHALT_B);
    if (z.y - zeilen.length * ZEILE < UNTEN) folge();
    for (const zeile of zeilen) {
      z.text(zeile, RAND_L, z.y, { font: a.fett ? z.bold : z.regular });
      z.y -= ZEILE;
    }
    z.y -= 6;
  }
  if (art.zustimmung) {
    if (z.y < UNTEN + 70) folge();
    z.text(art.zustimmung, RAND_L, z.y);
    z.y -= 34;
    z.linie(RAND_L, z.y, RAND_L + 135, z.y, 0.6, SCHWARZ);
    z.text("Ort, Datum, Unterschrift Auftraggeber", RAND_L, z.y - 12);
  }

  // ---------------------------------------------------------------------
  // Übersicht der Titel (ab zwei Titeln) und der Abschläge, je auf eigener Seite
  // ---------------------------------------------------------------------
  if (mitSummen && titelListe.length >= 2) {
    folge();
    z.text("Übersicht der Titel", RAND_L, z.y, { font: z.bold, groesse: 11 });
    z.y -= 24;
    kopfBand();
    z.text("Pos.", RAND_L + 4, z.y, { font: z.bold });
    z.text("Beschreibung", RAND_L + 50, z.y, { font: z.bold });
    z.text("Summe", SEITE_B - RAND_R - 4, z.y, { font: z.bold, rechts: true });
    z.y -= 25;
    for (const t of titelListe) {
      const zeilen = z.umbrechen(t.text, z.regular, SCHRIFT, INHALT_B - 150);
      if (z.y - zeilen.length * ZEILE < UNTEN) folge();
      z.text(t.nummer, RAND_L + 4, z.y);
      zeilen.forEach((zeile, i) => z.text(zeile, RAND_L + 50, z.y - i * ZEILE));
      z.text(euro(t.summe * vz), SEITE_B - RAND_R - 4, z.y, { rechts: true });
      z.y -= Math.max(1, zeilen.length) * ZEILE + 13;
    }
  }
  if (abschlaege.length) {
    folge();
    z.text("Übersicht der Abschläge", RAND_L, z.y, { font: z.bold, groesse: 11 });
    z.y -= 24;
    const sx = { datum: RAND_L + 230, netto: RAND_L + 345, ust: RAND_L + 415, brutto: SEITE_B - RAND_R - 4 };
    kopfBand();
    z.text("Rechnung", RAND_L + 4, z.y, { font: z.bold });
    z.text("Datum", sx.datum, z.y, { font: z.bold });
    z.text("Netto", sx.netto, z.y, { font: z.bold, rechts: true });
    z.text("USt.", sx.ust, z.y, { font: z.bold, rechts: true });
    z.text("Brutto", sx.brutto, z.y, { font: z.bold, rechts: true });
    z.y -= 25;
    let sn = 0;
    let sb = 0;
    for (const a of abschlaege) {
      z.text(`Abschlagsrechnung (${a.nummer})`, RAND_L + 4, z.y);
      z.text(a.datum ? formatDatum(a.datum) : "-", sx.datum, z.y);
      z.text(zahl(a.netto), sx.netto, z.y, { rechts: true });
      z.text(zahl(a.brutto - a.netto), sx.ust, z.y, { rechts: true });
      z.text(zahl(a.brutto), sx.brutto, z.y, { rechts: true });
      sn += a.netto;
      sb += a.brutto;
      z.y -= 20;
    }
    z.linie(RAND_L, z.y + 12, SEITE_B - RAND_R, z.y + 12, 0.4, LINIE);
    z.linie(RAND_L, z.y + 10, SEITE_B - RAND_R, z.y + 10, 0.4, LINIE);
    z.y -= 8;
    z.text("Summe aller Abschläge", RAND_L + 4, z.y, { font: z.bold });
    z.text(euro(sn), sx.netto, z.y, { font: z.bold, rechts: true });
    z.text(euro(sb - sn), sx.ust, z.y, { font: z.bold, rechts: true });
    z.text(euro(sb), sx.brutto, z.y, { font: z.bold, rechts: true });
  }

  fussZeilenZeichnen(z, f);
  // Entwurf: großes, helles „ENTWURF“ quer über jede Seite, damit die Vorschau nie als echte Rechnung durchgeht
  if (r0?.entwurf) {
    for (const seite of z.seiten) {
      seite.drawText("ENTWURF", { x: 120, y: 300, size: 96, font: z.bold, color: rgb(0.85, 0.85, 0.85), opacity: 0.45, rotate: degrees(35) });
    }
  }
  return doc.save();
}

/** Kopf der Folgeseiten wie Plancraft: Titel fett, Betreff, „vom Datum“, kleines Logo rechts. */
function folgekopf(z: Zeichner, titel: string, d: AngebotPdfDaten, logo: PDFImage | undefined) {
  logoZeichnen(z, logo, KOPF_OBEN + 6, 70, 34);
  z.text(titel, RAND_L, KOPF_OBEN, { font: z.bold, groesse: 11 });
  const betreff = z.umbrechen(d.betreff, z.regular, SCHRIFT, INHALT_B - 110)[0] ?? "";
  z.text(betreff, RAND_L, KOPF_OBEN - 13);
  z.text(`vom ${formatDatum(d.datum)}`, RAND_L, KOPF_OBEN - 25);
  z.y = KOPF_OBEN - 58;
}

/** Eine Zeile der Tabelle zeichnen (Position, Titel, Text, Summe des Titels oder Bild). */
function zeichneZeile(
  z: Zeichner,
  zeile: BerechneteZeile,
  bilder: Map<string, PDFImage>,
  platz: (hoehe: number) => void,
  folgeseite: () => void,
  preise: boolean,
  aktTitel: Titel | null,
) {
  const b = zeile.baustein;

  if (b.typ === "titel") {
    const zeilen = z.umbrechen(b.kurztext, z.bold, SCHRIFT, SPALTE.text.b);
    platz(zeilen.length * ZEILE + 30);
    z.text(nr(zeile.nummer), SPALTE.pos.x, z.y);
    zeilen.forEach((t, i) => z.text(t, SPALTE.text.x, z.y - i * ZEILE, { font: z.bold }));
    z.y -= Math.max(1, zeilen.length) * ZEILE + 8;
    return;
  }

  if (b.typ === "zwischensumme") {
    if (!preise) return;
    const label = aktTitel ? `Summe ${aktTitel.nummer} ${aktTitel.text}` : "Zwischensumme";
    const zeilen = z.umbrechen(label, z.bold, SCHRIFT, SPALTE.text.b);
    platz(zeilen.length * ZEILE + 8);
    zeilen.forEach((t, i) => z.text(t, SPALTE.text.x, z.y - i * ZEILE, { font: z.bold }));
    z.text(zahl(zeile.zwischensumme ?? 0), SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { font: z.bold, rechts: true });
    z.y -= zeilen.length * ZEILE + 8;
    return;
  }

  if (b.typ === "bild") {
    const bild = bilder.get(b.id);
    if (!bild) return;
    const maxB = Math.min(300, SPALTE.text.b + 80);
    const maxH = 230;
    const faktor = Math.min(maxB / bild.width, maxH / bild.height, 1);
    const w = bild.width * faktor;
    const h = bild.height * faktor;
    const unterschrift = b.kurztext ? z.umbrechen(b.kurztext, z.kursiv, 8.5, maxB) : [];
    platz(h + unterschrift.length * 11 + 16);
    z.seite.drawImage(bild, { x: SPALTE.text.x, y: z.y - h + 6, width: w, height: h });
    z.y -= h + 4;
    for (const t of unterschrift) {
      z.text(t, SPALTE.text.x, z.y, { font: z.kursiv, groesse: 8.5 });
      z.y -= 11;
    }
    z.y -= 8;
    return;
  }

  // Text und Position: Beschreibung in der Spalte „Beschreibung“ umbrechen (wie Plancraft, auch bei Hinweistexten)
  const zeilen: { t: string; bold: boolean }[] = [];
  const kurzFett = b.typ === "position" && b.langtext.trim() !== "";
  if (b.kurztext.trim()) for (const t of z.umbrechen(b.kurztext, kurzFett ? z.bold : z.regular, SCHRIFT, SPALTE.text.b)) zeilen.push({ t, bold: kurzFett });
  if (b.langtext.trim()) for (const t of z.umbrechen(b.langtext, z.regular, SCHRIFT, SPALTE.text.b)) zeilen.push({ t, bold: false });
  if (zeilen.length === 0) zeilen.push({ t: "", bold: false });

  const hoehe = zeilen.length * ZEILE + 8;
  if (hoehe < 330) platz(hoehe);

  let erste = true;
  for (const [i, l] of zeilen.entries()) {
    if (z.y < UNTEN + ZEILE) {
      folgeseite();
      erste = false; // Nummer und Preise stehen nur in der ersten Zeile
    }
    if (i === 0 && erste && b.typ === "position") {
      z.text(nr(zeile.nummer), SPALTE.pos.x, z.y);
      z.text(zahl(b.menge ?? 0, 2, 3), SPALTE.menge.x + SPALTE.menge.b, z.y, { rechts: true });
      z.text(b.einheit, SPALTE.einheit.x, z.y);
      if (preise) {
        z.text(zahl(b.einzelpreis ?? 0), SPALTE.preis.x + SPALTE.preis.b, z.y, { rechts: true });
        z.text(zahl(zeile.gesamt ?? 0), SPALTE.gesamt.x + SPALTE.gesamt.b, z.y, { rechts: true });
      }
    }
    z.text(l.t, SPALTE.text.x, z.y, { font: l.bold ? z.bold : z.regular });
    z.y -= ZEILE;
  }
  z.y -= 8;
}
