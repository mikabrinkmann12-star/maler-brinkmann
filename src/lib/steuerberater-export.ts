// Export der Ausgangsrechnungen für den Steuerberater (Mika, 24.10.2026): Rechnungsjournal als CSV (für Excel), Buchungsstapel im DATEV-Format
// (Vorschlag, nicht mit DATEV getestet) und ZIP-Teile mit allen Rechnungsdateien. Reine Logik, auch im Browser nutzbar.

import { RECHNUNGS_ART_NAMEN, type RechnungsArt } from "@/lib/rechnung";
import { csvText, csvZusammensetzen } from "@/lib/zeiten-auswertung";

export type JournalZeile = {
  nummer: string;
  art: RechnungsArt;
  /** JJJJ-MM-TT */
  datum: string;
  leistungVon: string;
  leistungBis: string;
  kunde: string;
  kundennummer: string;
  projektnummer: string;
  betreff: string;
  /** Netto und Brutto wie gespeichert (Gutschrift und Storno negativ; bei Schlussrechnungen nach Abzug der Abschläge) */
  netto: number;
  brutto: number;
  steuersatz: number;
  reverseCharge: boolean;
  /** „offen“, „bezahlt“, „storniert“ */
  status: string;
  bezahltAm: string | null;
  bezugNummer: string;
  abzugBrutto: number;
  anbieter: "eigen" | "aelter";
  /** Personenkonto des Kunden (Debitor); null = Sammeldebitor aus den Einstellungen */
  debitor?: number | null;
};

const komma = (w: number): string => (Math.round(w * 100) / 100).toFixed(2).replace(".", ",");
const tt = (iso: string): string => (iso ? iso.split("-").reverse().join(".") : "");

/** Rechnungsjournal: eine Zeile je Rechnung, Gutschrift und Storno, sortiert nach Datum und Nummer. Semikolon, Dezimalkomma (der Aufrufer setzt das BOM). */
export function journalCsv(zeilen: JournalZeile[]): string {
  const kopf = [
    "Rechnungsnummer", "Art", "Datum", "Leistung von", "Leistung bis", "Kunde", "Kundennummer", "Debitor", "Projekt", "Betreff",
    "Netto", "USt-Satz %", "USt", "Brutto", "Reverse-Charge", "Angerechnete Abschläge (brutto)", "Status", "Bezahlt am", "Bezug", "Erstellt in",
  ];
  const sortiert = [...zeilen].sort((a, b) => a.datum.localeCompare(b.datum) || a.nummer.localeCompare(b.nummer));
  const daten = sortiert.map((z) => [
    csvText(z.nummer), RECHNUNGS_ART_NAMEN[z.art], tt(z.datum), tt(z.leistungVon), tt(z.leistungBis), csvText(z.kunde), csvText(z.kundennummer), z.debitor ? String(z.debitor) : "", csvText(z.projektnummer), csvText(z.betreff),
    komma(z.netto), z.reverseCharge ? "0" : String(z.steuersatz).replace(".", ","), komma(z.brutto - z.netto), komma(z.brutto), z.reverseCharge ? "ja" : "nein",
    komma(z.abzugBrutto), z.status, tt(z.bezahltAm ?? ""), csvText(z.bezugNummer), z.anbieter === "eigen" ? "App" : "ältere Rechnung",
  ]);
  const summe = sortiert.reduce((s, z) => ({ netto: s.netto + z.netto, brutto: s.brutto + z.brutto }), { netto: 0, brutto: 0 });
  const fuss = ["Summe", "", "", "", "", "", "", "", "", "", komma(summe.netto), "", komma(summe.brutto - summe.netto), komma(summe.brutto), "", "", "", "", "", ""];
  return csvZusammensetzen([kopf, ...daten, fuss]);
}

// ---------------------------------------------------------------------------
// DATEV-Buchungsstapel (EXTF, Format 510). VORSCHLAG: Aufbau nach dem bekannten Format, aber NICHT mit DATEV geprüft. Konten (SKR03) und
// Beraternummern sind Einstellungen und müssen vom Steuerberater bestätigt werden.
// ---------------------------------------------------------------------------

export type DatevEinstellungen = {
  berater: number;
  mandant: number;
  /** Sammeldebitor für Kunden ohne eigenes Konto (normalerweise hat jeder Kunde eins, siehe contacts.debitorennummer) */
  debitor: number;
  erloes19: number;
  erloes7: number;
  /** Erlöse ohne Steuer (0 %) */
  erloes0: number;
  /** Erlöse, bei denen der Kunde die Steuer schuldet (§ 13b UStG, Bauleistungen) */
  erloesReverseCharge: number;
  /** Abschlagsrechnungen getrennt verbuchen (Steuerberaterin, 12.11.2026): 19 % und § 13b */
  abschlag19: number;
  abschlagReverseCharge: number;
  /** Schlussrechnungen auf ein eigenes Konto; die Steuerberaterin bucht sie dann mit den Abschlägen */
  schluss: number;
  sachkontenlaenge: number;
};

/** Werte der Steuerberaterin (12.11.2026, SKR03): Erlöse 8400/8300, 13b 8337, Abschläge 1718/1719, Schluss 1590. */
export const DATEV_STANDARD: DatevEinstellungen = {
  berater: 0, mandant: 0, debitor: 10000, erloes19: 8400, erloes7: 8300, erloes0: 8200, erloesReverseCharge: 8337,
  abschlag19: 1718, abschlagReverseCharge: 1719, schluss: 1590, sachkontenlaenge: 4,
};

/** Gespeicherten Wert lesen; Unbrauchbares fällt auf die Standardwerte zurück. */
export function datevAusJson(wert: unknown): DatevEinstellungen {
  const o = (wert && typeof wert === "object" ? wert : {}) as Record<string, unknown>;
  const zahl = (n: unknown, min: number, max: number, vorgabe: number) => (typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : vorgabe);
  const s = DATEV_STANDARD;
  return {
    berater: zahl(o.berater, 0, 9_999_999, s.berater),
    mandant: zahl(o.mandant, 0, 99_999, s.mandant),
    debitor: zahl(o.debitor, 1, 99_999_999, s.debitor),
    erloes19: zahl(o.erloes19, 1, 99_999_999, s.erloes19),
    erloes7: zahl(o.erloes7, 1, 99_999_999, s.erloes7),
    erloes0: zahl(o.erloes0, 1, 99_999_999, s.erloes0),
    erloesReverseCharge: zahl(o.erloes_reverse_charge, 1, 99_999_999, s.erloesReverseCharge),
    abschlag19: zahl(o.abschlag19, 1, 99_999_999, s.abschlag19),
    abschlagReverseCharge: zahl(o.abschlag_reverse_charge, 1, 99_999_999, s.abschlagReverseCharge),
    schluss: zahl(o.schluss, 1, 99_999_999, s.schluss),
    sachkontenlaenge: zahl(o.sachkontenlaenge, 4, 8, s.sachkontenlaenge),
  };
}

/** Gegenkonto (Erlöskonto) nach Steuersatz. */
export function erloesKonto(z: Pick<JournalZeile, "steuersatz" | "reverseCharge">, e: DatevEinstellungen): number {
  if (z.reverseCharge) return e.erloesReverseCharge;
  return z.steuersatz === 19 ? e.erloes19 : z.steuersatz === 7 ? e.erloes7 : e.erloes0;
}

/**
 * Gegenkonto einer Buchung: Abschlagsrechnungen auf die Abschlagskonten (19 % bzw. § 13b; andere Sätze wie Erlöse),
 * Schlussrechnungen auf das Schlusskonto, alles andere auf das Erlöskonto nach Steuersatz.
 */
export function gegenKonto(z: Pick<JournalZeile, "art" | "steuersatz" | "reverseCharge">, e: DatevEinstellungen): number {
  if (z.art === "abschlag") {
    if (z.reverseCharge) return e.abschlagReverseCharge;
    if (z.steuersatz === 19) return e.abschlag19;
  }
  if (z.art === "schluss") return e.schluss;
  return erloesKonto(z, e);
}

const ohneUmlaute = (t: string): string =>
  t.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss").normalize("NFD").replace(/\p{Diacritic}/gu, "");
const datevText = (t: string, max: number): string => `"${ohneUmlaute(t).replace(/[";\r\n]+/g, " ").trim().slice(0, max)}"`;
const ttmm = (iso: string): string => `${iso.slice(8, 10)}${iso.slice(5, 7)}`;
const stempel = (d: Date): string => d.toISOString().replace(/[-:T]/g, "").slice(0, 14) + "000";

/**
 * Buchungsstapel im DATEV-Format: Kopfzeile, Spaltenüberschriften, eine Buchung je Rechnung. Rechnung: Soll Debitor / Haben Erlös; Gutschrift und
 * Storno mit „H“ (Haben Debitor) und positivem Betrag. Der Aufrufer schreibt die Datei in Windows-1252 (DATEV erwartet ANSI).
 */
export function datevCsv(zeilen: JournalZeile[], e: DatevEinstellungen, zeitraum: { von: string; bis: string }, jetzt: Date = new Date()): string {
  const jahr = zeitraum.von.slice(0, 4);
  const kopf = [
    '"EXTF"', "510", "21", '"Buchungsstapel"', "7", stempel(jetzt), "", '"RE"', '""', '""', String(e.berater), String(e.mandant), `${jahr}0101`, String(e.sachkontenlaenge),
    zeitraum.von.replace(/-/g, ""), zeitraum.bis.replace(/-/g, ""), '"Ausgangsrechnungen"', '""', "1", "0", "0", '"EUR"', "", '""', "", "", '"03"', "", "", '""', '""',
  ].join(";");
  const spalten = [
    "Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel",
    "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext",
  ].map((s) => `"${s}"`).join(";");
  // Eine bei einer älteren Rechnung (aus einem früheren System) vermerkte Stornierung hat bei uns keinen Storno-Beleg, der sie ausgleicht: sie nicht buchen (steht weiter im Journal). Bei eigenen Rechnungen gleicht der Storno-Beleg aus.
  const sortiert = zeilen.filter((z) => !(z.status === "storniert" && z.anbieter !== "eigen")).sort((a, b) => a.datum.localeCompare(b.datum) || a.nummer.localeCompare(b.nummer));
  const buchungen = sortiert.map((z) => {
    const gutschrift = z.art === "gutschrift" || z.art === "storno";
    return [
      komma(Math.abs(z.brutto)), gutschrift ? '"H"' : '"S"', '"EUR"', "", "", "", String(z.debitor ?? e.debitor), String(gegenKonto(z, e)), "", ttmm(z.datum), datevText(z.nummer, 36), "", "",
      datevText(`${RECHNUNGS_ART_NAMEN[z.art]} ${z.kunde} ${z.betreff}`, 60),
    ].join(";");
  });
  return [kopf, spalten, ...buchungen].join("\r\n") + "\r\n";
}

export type DebitorStamm = {
  debitor: number;
  firma: boolean;
  firmenname: string;
  vorname: string;
  nachname: string;
  kundennummer: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  ustId: string;
};

const LAENDER_ISO: Record<string, string> = { deutschland: "DE", niederlande: "NL", "österreich": "AT", oesterreich: "AT", schweiz: "CH", belgien: "BE", "dänemark": "DK", polen: "PL", frankreich: "FR", luxemburg: "LU" };

/**
 * Stammdaten der Kundenkonten im DATEV-Format „Debitoren/Kreditoren“ (Kategorie 16), damit beim Steuerberater jedes Konto einen Namen
 * und eine Anschrift hat. VORSCHLAG wie der Buchungsstapel: nach dem bekannten Aufbau, nicht mit DATEV geprüft. Windows-1252 schreibt der Aufrufer.
 */
export function debitorenCsv(kunden: DebitorStamm[], e: DatevEinstellungen, jetzt: Date = new Date()): string {
  const jahr = String(jetzt.getUTCFullYear());
  const kopf = [
    '"EXTF"', "510", "16", '"Debitoren/Kreditoren"', "5", stempel(jetzt), "", '"RE"', '""', '""', String(e.berater), String(e.mandant), `${jahr}0101`, String(e.sachkontenlaenge),
    "", "", '"Kunden"', '""', "", "", "", '""', "", '""', "", "", '"03"', "", "", '""', '""',
  ].join(";");
  const spalten = [
    "Konto", "Name (Adressatentyp Unternehmen)", "Unternehmensgegenstand", "Name (Adressatentyp natuerl. Person)", "Vorname (Adressatentyp natuerl. Person)",
    "Name (Adressatentyp keine Angabe)", "Adressatentyp", "Kurzbezeichnung", "EU-Land", "EU-USt-IdNr.", "Anrede", "Titel/Akad. Grad", "Adelstitel", "Namensvorsatz",
    "Adressart", "Strasse", "Postfach", "Postleitzahl", "Ort", "Land",
  ].map((s) => `"${s}"`).join(";");
  const zeilen = [...kunden].sort((a, b) => a.debitor - b.debitor).map((k) => {
    const ust = k.ustId.replace(/\s/g, "").toUpperCase();
    const name = k.firma ? k.firmenname : [k.vorname, k.nachname].filter(Boolean).join(" ");
    return [
      String(k.debitor),
      k.firma ? datevText(k.firmenname, 50) : '""', '""',
      k.firma ? '""' : datevText(k.nachname || k.firmenname, 30), k.firma ? '""' : datevText(k.vorname, 30),
      '""', k.firma ? "2" : "1", datevText(`${name} ${k.kundennummer}`.trim(), 15),
      ust ? datevText(ust.slice(0, 2), 2) : '""', ust ? datevText(ust.slice(2), 13) : '""',
      '""', '""', '""', '""', '"STR"', datevText(k.strasse, 36), '""', datevText(k.plz, 10), datevText(k.ort, 30),
      datevText(LAENDER_ISO[(k.land || "Deutschland").toLowerCase()] ?? "DE", 2),
    ].join(";");
  });
  return [kopf, spalten, ...zeilen].join("\r\n") + "\r\n";
}

/** Zeitraum aus Adressparametern; ungültig = null. */
export function zeitraumLesen(von: string | null | undefined, bis: string | null | undefined): { von: string; bis: string } | null {
  const tag = /^\d{4}-\d{2}-\d{2}$/;
  if (!von || !bis || !tag.test(von) || !tag.test(bis) || Number.isNaN(Date.parse(`${von}T00:00:00Z`)) || Number.isNaN(Date.parse(`${bis}T00:00:00Z`)) || bis < von) return null;
  // höchstens 3 Jahre, damit eine Abfrage nicht ausufert
  if (Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`) > 3 * 366 * 86_400_000) return null;
  return { von, bis };
}

/** Voriger Kalendermonat (Standard-Vorschlag): von erster bis letzter Tag. */
export function vorigerMonat(heute: string): { von: string; bis: string } {
  const [j, m] = heute.split("-").map(Number);
  const vj = m === 1 ? j - 1 : j;
  const vm = m === 1 ? 12 : m - 1;
  const letzter = new Date(Date.UTC(vj, vm, 0)).getUTCDate();
  const zwei = (n: number) => String(n).padStart(2, "0");
  return { von: `${vj}-${zwei(vm)}-01`, bis: `${vj}-${zwei(vm)}-${zwei(letzter)}` };
}

/** Dateien je ZIP-Teil: Vercel begrenzt die Antwort einer Funktion auf rund 4,5 MB, ein Rechnungs-PDF hat meist unter 200 KB. */
export const ZIP_TEIL_GROESSE = 15;

/** Liste in Teile fester Größe zerlegen (ZIP-Downloads sind wegen der Antwortgrenze von Vercel klein). */
export function inTeile<T>(liste: T[], groesse: number): T[][] {
  const teile: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse) teile.push(liste.slice(i, i + groesse));
  return teile;
}
