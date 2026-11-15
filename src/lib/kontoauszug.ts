// Kontoauszug einlesen (Mika, 15.11.2026: Bankabgleich per Datei statt FinTS). Reine Logik, ohne Netz und Datenbank.
// Unterstützt: CSV aus dem Online-Banking (Volksbank/Raiffeisen, Sparkasse und ähnliche, Spalten werden über die Kopfzeile erkannt)
// und CAMT.052/053 (XML). Die Datei wird nicht gespeichert; es zählen nur Datum, Betrag, Name, IBAN und Verwendungszweck.
import { XMLParser } from "fast-xml-parser";
import { csvLesen } from "@/lib/csv";

export type Umsatz = {
  /** Buchungstag JJJJ-MM-TT */
  datum: string;
  /** Eingang positiv, Abbuchung negativ */
  betrag: number;
  /** Name des Zahlungsbeteiligten (Empfänger bzw. Auftraggeber) */
  name: string;
  iban: string;
  zweck: string;
};

export type KontoauszugErgebnis = { umsaetze: Umsatz[]; format: "csv" | "camt" } | { fehler: string };

export const MAX_KONTOAUSZUG_BYTES = 5 * 1024 * 1024;

/** Bytes → Text: UTF-8, sonst Windows-1252 (ältere Bank-Exporte). */
export function textDekodieren(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  return new TextDecoder("windows-1252").decode(bytes);
}

/** „-1.234,56“, „1234.56“, „1.234,56 S“ (Soll) → Zahl. */
export function betragAusText(roh: string): number | null {
  let t = roh.replace(/\s|EUR|€/gi, "");
  let vorzeichen = 1;
  if (/S$/i.test(t)) { vorzeichen = -1; t = t.slice(0, -1); }
  else if (/H$/i.test(t)) t = t.slice(0, -1);
  if (!/^[-+]?\d[\d.,]*$/.test(t)) return null;
  const komma = t.lastIndexOf(",");
  const punkt = t.lastIndexOf(".");
  const normal = komma > punkt ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100 * vorzeichen) / 100 : null;
}

/** „15.11.2026“, „15.11.26“, „2026-11-15“ → „2026-11-15“. */
export function datumAusText(roh: string): string | null {
  const t = roh.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const jahr = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${jahr}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const klein = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");

/** Spalte über mögliche Namen finden (klein, ohne Sonderzeichen; Teilwort reicht). */
function spalte(kopf: string[], ...namen: string[]): number {
  const k = kopf.map(klein);
  for (const n of namen) {
    const i = k.findIndex((s) => s === klein(n));
    if (i >= 0) return i;
  }
  for (const n of namen) {
    const i = k.findIndex((s) => s.includes(klein(n)));
    if (i >= 0) return i;
  }
  return -1;
}

export function csvKontoauszug(text: string): KontoauszugErgebnis {
  const tabelle = csvLesen(text);
  // Manche Banken schreiben vor die Tabelle noch Kontoangaben: Kopfzeile = erste Zeile mit Buchungstag und Betrag
  const kopfIndex = tabelle.findIndex((z) => spalte(z, "Buchungstag", "Buchungsdatum", "Datum") >= 0 && spalte(z, "Betrag", "Umsatz") >= 0);
  if (kopfIndex < 0) return { fehler: "In der Datei wurden keine Spalten „Buchungstag“ und „Betrag“ gefunden. Bitte den Umsatz-Export als CSV oder CAMT wählen." };
  const kopf = tabelle[kopfIndex];
  const iDatum = spalte(kopf, "Buchungstag", "Buchungsdatum", "Datum");
  const iBetrag = spalte(kopf, "Betrag", "Umsatz");
  const iSollHaben = spalte(kopf, "Soll/Haben", "S/H");
  const iName = spalte(kopf, "Name Zahlungsbeteiligter", "Beguenstigter/Zahlungspflichtiger", "Begünstigter/Zahlungspflichtiger", "Empfänger/Zahlungspflichtiger", "Auftraggeber/Empfänger", "Name");
  const iIban = spalte(kopf, "IBAN Zahlungsbeteiligter", "Kontonummer/IBAN", "IBAN Gegenkonto", "Kontonummer");
  const iZweck = spalte(kopf, "Verwendungszweck", "Vorgang/Verwendungszweck", "Buchungstext");

  const umsaetze: Umsatz[] = [];
  for (const z of tabelle.slice(kopfIndex + 1)) {
    const datum = datumAusText(z[iDatum] ?? "");
    let betrag = betragAusText(z[iBetrag] ?? "");
    if (!datum || betrag === null) continue;
    if (iSollHaben >= 0 && /^s/i.test((z[iSollHaben] ?? "").trim()) && betrag > 0) betrag = -betrag;
    umsaetze.push({
      datum,
      betrag,
      name: iName >= 0 ? (z[iName] ?? "").trim() : "",
      iban: iIban >= 0 ? (z[iIban] ?? "").replace(/\s/g, "").toUpperCase() : "",
      zweck: iZweck >= 0 ? (z[iZweck] ?? "").replace(/\s+/g, " ").trim() : "",
    });
  }
  if (!umsaetze.length) return { fehler: "In der Datei stehen keine lesbaren Umsätze." };
  return { umsaetze, format: "csv" };
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, trimValues: true, parseTagValue: false, isArray: (name) => ["Stmt", "Rpt", "Ntry", "TxDtls", "Ustrd"].includes(name) });

type Knoten = Record<string, unknown>;
const k = (o: unknown, ...pfad: string[]): unknown => pfad.reduce<unknown>((x, p) => (x && typeof x === "object" ? (x as Knoten)[p] : undefined), o);
const text = (o: unknown): string => (typeof o === "string" ? o : o && typeof o === "object" && "#text" in (o as Knoten) ? String((o as Knoten)["#text"]) : "");

export function camtKontoauszug(inhalt: string): KontoauszugErgebnis {
  let doc: unknown;
  try {
    doc = xml.parse(inhalt);
  } catch {
    return { fehler: "Die XML-Datei konnte nicht gelesen werden." };
  }
  const wurzel = k(doc, "Document") as Knoten | undefined;
  const auszuege = [
    ...((k(wurzel, "BkToCstmrStmt", "Stmt") as unknown[]) ?? []),
    ...((k(wurzel, "BkToCstmrAcctRpt", "Rpt") as unknown[]) ?? []),
  ];
  if (!auszuege.length) return { fehler: "Das ist kein CAMT-Kontoauszug (camt.052 oder camt.053)." };
  const umsaetze: Umsatz[] = [];
  for (const a of auszuege) {
    for (const e of ((k(a, "Ntry") as unknown[]) ?? [])) {
      const betrag = Number(text(k(e, "Amt")));
      const sh = text(k(e, "CdtDbtInd"));
      const datum = datumAusText(text(k(e, "BookgDt", "Dt")) || text(k(e, "BookgDt", "DtTm")) || text(k(e, "ValDt", "Dt")));
      if (!Number.isFinite(betrag) || !datum) continue;
      const details = ((k(e, "NtryDtls", "TxDtls") as unknown[]) ?? [])[0];
      const eingang = sh === "CRDT";
      const partei = eingang ? "Dbtr" : "Cdtr";
      const konto = eingang ? "DbtrAcct" : "CdtrAcct";
      const name = text(k(details, "RltdPties", partei, "Nm")) || text(k(details, "RltdPties", partei, "Pty", "Nm"));
      const iban = text(k(details, "RltdPties", konto, "Id", "IBAN"));
      const zweck = (((k(details, "RmtInf", "Ustrd") as unknown[]) ?? []).map(text).join(" ") || text(k(e, "AddtlNtryInf"))).replace(/\s+/g, " ").trim();
      umsaetze.push({ datum, betrag: Math.round((eingang ? betrag : -betrag) * 100) / 100, name: name.trim(), iban: iban.replace(/\s/g, "").toUpperCase(), zweck });
    }
  }
  if (!umsaetze.length) return { fehler: "Im Kontoauszug stehen keine Umsätze." };
  return { umsaetze, format: "camt" };
}

/** Datei erkennen und lesen. ZIP-Dateien (manche Banken packen CAMT-Dateien) bitte vorher entpacken. */
export function kontoauszugLesen(bytes: Uint8Array, dateiname: string): KontoauszugErgebnis {
  if (bytes.byteLength === 0) return { fehler: "Die Datei ist leer." };
  if (bytes.byteLength > MAX_KONTOAUSZUG_BYTES) return { fehler: "Die Datei ist zu groß (höchstens 5 MB)." };
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { fehler: "Das ist eine ZIP-Datei. Bitte entpacken und die XML-Datei wählen, oder im Online-Banking „CSV“ als Format nehmen." };
  const inhalt = textDekodieren(bytes);
  if (/\.xml$/i.test(dateiname) || /^\s*<\?xml|<Document/i.test(inhalt.slice(0, 500))) return camtKontoauszug(inhalt);
  return csvKontoauszug(inhalt);
}
