// Bericht als PDF (A4): Firmenkopf mit Logo, Titel, Angaben, alle Abschnitte der Berichtsart (Aufbau aus bericht-arten.ts),
// Fotos (zwei pro Zeile), Unterschrift des Kunden und Fußzeile mit den Firmendaten.

import { PDFDocument, type PDFImage } from "pdf-lib";
import { BERICHT_DEFS, type BerichtArt } from "@/lib/bericht-arten";
import { eintragsZeile, wetterText, type BerichtDaten, type EintragWerte } from "@/lib/bericht";
import type { Firma } from "@/lib/firma";
import { formatDatum } from "@/lib/format";
import {
  GRAU, INHALT_B, KOPF_OBEN, RAND_L, RAND_R, SCHRIFT, SEITE_B, UNTEN, ZEILE,
  Zeichner, firmenKopfZeichnen, fussZeilenZeichnen,
} from "@/lib/pdf-zeichner";

export type BerichtPdfDaten = {
  firma: Firma;
  /** Firmenlogo (PNG oder JPEG), erscheint oben links */
  logo?: Uint8Array;
  art: BerichtArt;
  titel: string;
  entwurf: boolean;
  datum: string;
  projektName: string;
  projektnummer: string;
  baustelle: string;
  /** Auftraggeber (Name, ggf. mit Anschrift in weiteren Zeilen) */
  kunde: string;
  daten: BerichtDaten;
  personName: (id: string) => string;
  /** JPEG-Bytes der Fotos nach ID */
  fotos: Map<string, Uint8Array>;
  erstelltVon: string;
  /** schon formatiert, z. B. „18.10.2026, 14:05“; leer bei Entwürfen */
  abgeschlossenAm: string;
  unterschrift?: { name: string; wann: string; bild: Uint8Array };
};

const FOTO_B = (INHALT_B - 12) / 2;
const FOTO_MAX_H = 175;

export async function berichtPdf(d: BerichtPdfDaten): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${d.titel} ${formatDatum(d.datum)} ${d.projektName}`.slice(0, 200));
  doc.setProducer("Maler Brinkmann");
  doc.setCreator("Maler Brinkmann");
  const z = new Zeichner(doc);
  await z.laden();

  const def = BERICHT_DEFS[d.art];
  const a = d.daten.allgemein;
  const titel = d.entwurf ? `${d.titel} - Entwurf` : d.titel;
  const folgekopf = () => {
    z.neueSeite();
    z.text(titel, RAND_L, KOPF_OBEN, { font: z.bold, groesse: 12 });
    z.text(formatDatum(d.datum), SEITE_B - RAND_R, KOPF_OBEN, { rechts: true, farbe: GRAU });
    z.text(z.umbrechen(d.projektName, z.regular, SCHRIFT, INHALT_B - 90)[0] ?? "", RAND_L, KOPF_OBEN - 15, { farbe: GRAU });
    z.y = KOPF_OBEN - 44;
  };
  /** Platz für `hoehe` Punkte schaffen, sonst neue Seite. */
  const platz = (hoehe: number) => {
    if (z.y - hoehe < UNTEN) folgekopf();
  };
  const absatz = (text: string, einzug = 0, fett = false) => {
    for (const zeile of z.umbrechen(text, fett ? z.bold : z.regular, SCHRIFT, INHALT_B - einzug)) {
      platz(ZEILE);
      z.text(zeile, RAND_L + einzug, z.y, fett ? { font: z.bold } : {});
      z.y -= ZEILE;
    }
  };
  const ueberschrift = (text: string) => {
    platz(ZEILE * 3 + 8);
    z.y -= 10;
    z.text(text, RAND_L, z.y, { font: z.bold, groesse: 10.5 });
    z.y -= ZEILE + 3;
  };

  // Seite 1: Firmenkopf, Titel, Angaben
  z.neueSeite();
  await firmenKopfZeichnen(z, d.firma, d.logo);
  z.y = 722;
  z.text(titel, RAND_L, z.y, { font: z.bold, groesse: 17 });
  z.y -= 28;

  const zeitraum = def.allgemein.zeitraum && (a.von || a.bis) ? [a.von && formatDatum(a.von), a.bis && formatDatum(a.bis)].filter(Boolean).join(" – ") : "";
  const angaben: [string, string][] = [
    ["Datum", formatDatum(d.datum)],
    ["Zeitraum", zeitraum],
    ["Projekt", [d.projektName, d.projektnummer && `(${d.projektnummer})`].filter(Boolean).join(" ")],
    ["Leistungsort", d.baustelle],
    ["Auftraggeber", d.kunde],
    ["Wetter", def.allgemein.wetter ? wetterText(a.wetter, a.temperatur) : ""],
    ["Erstellt von", d.erstelltVon],
  ];
  for (const [label, wert] of angaben) {
    if (!wert) continue;
    const zeilen = z.umbrechen(wert, z.regular, SCHRIFT, INHALT_B - 80);
    z.text(label, RAND_L, z.y, { font: z.bold, farbe: GRAU });
    for (const zeile of zeilen) {
      z.text(zeile, RAND_L + 80, z.y);
      z.y -= ZEILE;
    }
  }
  z.linie(RAND_L, z.y - 2, SEITE_B - RAND_R, z.y - 2, 0.6);
  z.y -= 6;

  // Abschnitte der Berichtsart
  for (const ab of def.abschnitte) {
    if (ab.id === "allgemein") continue;

    const bildFelder = ab.felder.filter((f) => f.art === "bilder");
    if (bildFelder.length) {
      const bilder: PDFImage[] = [];
      for (const f of bildFelder) {
        const ids = d.daten.werte[f.schluessel];
        for (const id of Array.isArray(ids) ? (ids as string[]) : []) {
          const bytes = d.fotos.get(id);
          if (!bytes) continue;
          try {
            bilder.push(await doc.embedJpg(bytes));
          } catch {
            // kaputtes Foto: wird weggelassen
          }
        }
      }
      if (bilder.length) {
        platz(FOTO_MAX_H + ZEILE * 3);
        ueberschrift(ab.titel);
        z.y += 4;
        for (let i = 0; i < bilder.length; i += 2) {
          const reihe = bilder.slice(i, i + 2).map((b) => {
            const faktor = Math.min(FOTO_B / b.width, FOTO_MAX_H / b.height, 1);
            return { b, w: b.width * faktor, h: b.height * faktor };
          });
          const hoehe = Math.max(...reihe.map((r) => r.h));
          platz(hoehe + 8);
          reihe.forEach((r, n) => {
            z.seite.drawImage(r.b, { x: RAND_L + n * (FOTO_B + 12), y: z.y - r.h, width: r.w, height: r.h });
          });
          z.y -= hoehe + 10;
        }
      }
      continue;
    }

    ueberschrift(ab.titel);
    for (const f of ab.felder) {
      if (f.art === "festtext") {
        absatz(f.text);
        continue;
      }
      const w = d.daten.werte[f.schluessel];
      if (f.art === "text") absatz(String(w ?? "").trim() || "–");
      else if (f.art === "auswahl") absatz(f.optionen.find((o) => o.wert === w)?.name ?? "–");
      else if (f.art === "checkliste") {
        const an = Array.isArray(w) ? (w as string[]) : [];
        for (const p of f.punkte) absatz(`[${an.includes(p.wert) ? "x" : " "}] ${p.name}`);
      } else if (f.art === "liste") {
        const eintraege = Array.isArray(w) ? (w as EintragWerte[]) : [];
        if (!eintraege.length) absatz("–");
        eintraege.forEach((e, i) => {
          const zeile = eintragsZeile(f, e, d.personName, formatDatum);
          absatz(`${i + 1}. ${zeile.titel}`, 0, true);
          for (const t of zeile.zusatz) absatz(t, 14);
        });
      }
    }
  }

  // Unterschrift des Kunden
  platz(110);
  z.y -= 14;
  z.text("Unterschrift Auftraggeber", RAND_L, z.y, { font: z.bold, groesse: 10.5 });
  z.y -= 8;
  if (d.unterschrift) {
    try {
      const bild = await doc.embedPng(d.unterschrift.bild);
      const faktor = Math.min(220 / bild.width, 60 / bild.height, 1);
      z.seite.drawImage(bild, { x: RAND_L, y: z.y - bild.height * faktor, width: bild.width * faktor, height: bild.height * faktor });
      z.y -= bild.height * faktor + 4;
    } catch {
      z.y -= 40;
    }
    z.linie(RAND_L, z.y, RAND_L + 220, z.y, 0.6, GRAU);
    z.text(`${d.unterschrift.name}, ${d.unterschrift.wann}`, RAND_L, z.y - 11, { groesse: 8.5 });
  } else {
    z.y -= 40;
    z.linie(RAND_L, z.y, RAND_L + 220, z.y, 0.6, GRAU);
    z.text("Ort, Datum, Unterschrift", RAND_L, z.y - 11, { groesse: 8.5 });
  }
  if (d.abgeschlossenAm) z.text(`Bericht abgeschlossen am ${d.abgeschlossenAm}`, SEITE_B - RAND_R, z.y - 11, { groesse: 8, farbe: GRAU, rechts: true });

  fussZeilenZeichnen(z, d.firma);
  return doc.save();
}
