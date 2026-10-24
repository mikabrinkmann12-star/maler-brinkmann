// Eigene Rechnungen (die App vergibt Nummer und PDF selbst, seit 24.10.2026). Reine Logik, auch im Browser nutzbar.
// Der Steuerberater von Ralf muss das Verfahren vor dem echten Einsatz bestätigen (GoBD, ab 2028 E-Rechnung).

import type { Firma } from "@/lib/firma";
import { formatBetrag, formatZahl } from "@/lib/format";
import type { RechnungsArt, RechnungsBaustein } from "@/lib/rechnung";

/** Nummernkreis aus den Einstellungen: Kürzel und Startnummer (gilt nur für die erste Rechnung eines Jahres). */
export const RECHNUNG_PRAEFIX_STANDARD = "R-";
export const GUTSCHRIFT_PRAEFIX_STANDARD = "G-";

/** So sieht die nächste Nummer aus: „R-2026-0001“. Spiegelt die Datenbank-Funktion `rechnung_finalisieren`. */
export function rechnungsnummerBeispiel(praefix: string, jahr: number, laufend: number): string {
  return `${praefix.trim() || RECHNUNG_PRAEFIX_STANDARD}${jahr}-${String(laufend).padStart(4, "0")}`;
}

/** Kürzel prüfen: höchstens 10 Zeichen aus Buchstaben, Ziffern, Bindestrich, Schrägstrich, Punkt und Klammern. */
export function praefixGueltig(wert: string): boolean {
  return /^[A-Za-z0-9\-/.()]{1,10}$/.test(wert.trim());
}

/**
 * Pflichtangaben nach § 14 UStG, die die App prüfen kann, bevor sie eine Rechnung fertigstellt. Leer = alles da.
 * Nicht geprüft werden können Inhalte wie die Leistungsbeschreibung (Positionen) und die Steuernummer des Kunden bei Reverse-Charge.
 */
export function pflichtangabenFehlen(firma: Firma, anschrift: string[], reverseCharge: boolean): string[] {
  const fehlt: string[] = [];
  if (!firma.name.trim()) fehlt.push("Firmenname");
  if (!firma.strasse.trim() || !firma.plz.trim() || !firma.ort.trim()) fehlt.push("Firmenanschrift (Straße, PLZ, Ort)");
  if (!firma.steuernummer.trim() && !firma.ustid.trim()) fehlt.push("Steuernummer oder USt-IdNr. der Firma");
  if (anschrift.filter((z) => z.trim()).length < 2) fehlt.push("Anschrift des Kunden (Name und Straße/Ort)");
  void reverseCharge;
  return fehlt;
}

/** Hinweis (kein Hindernis): Bei Reverse-Charge gehört die USt-IdNr. des Kunden auf die Rechnung, die App speichert sie noch nicht. */
export function reverseChargeHinweis(reverseCharge: boolean): string | null {
  return reverseCharge
    ? "Bei Reverse-Charge (§ 13b UStG) gehört die USt-IdNr. des Kunden auf die Rechnung. Die App speichert sie noch nicht; bitte mit dem Steuerberater klären."
    : null;
}

/** Fälligkeitsdatum (JJJJ-MM-TT): Rechnungsdatum plus Zahlungsziel in Tagen. */
export function faelligkeitsDatum(rechnungsdatum: string, zahlungszielTage: number): string {
  const d = new Date(`${rechnungsdatum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + zahlungszielTage);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Rechnungsarten: Abschlag, Schluss, Gutschrift, Storno
// ---------------------------------------------------------------------------

/** Cent genau runden (0,5 rundet auf), ohne Gleitkomma-Fehler wie 1,005 → 1,00. */
export function aufCent(betrag: number): number {
  return Math.round((betrag + Number.EPSILON) * 100) / 100;
}

export type AbschlagWahl = { modus: "prozent"; prozent: number } | { modus: "betrag"; netto: number };

/** Netto-Betrag der Abschlagsrechnung: Prozent der Netto-Auftragssumme (nach Rabatt) oder ein fester Betrag; Fehlertext, wenn er nicht passt. */
export function abschlagNetto(auftragssummeNetto: number, wahl: AbschlagWahl, bereitsAbgerechnetNetto = 0): { netto: number } | { fehler: string } {
  if (auftragssummeNetto <= 0) return { fehler: "Das Angebot hat keine Summe, von der ein Abschlag berechnet werden könnte." };
  const netto = wahl.modus === "prozent" ? aufCent((auftragssummeNetto * wahl.prozent) / 100) : aufCent(wahl.netto);
  if (!Number.isFinite(netto) || netto <= 0) return { fehler: "Bitte einen Prozentsatz oder Betrag über 0 angeben." };
  if (wahl.modus === "prozent" && wahl.prozent > 100) return { fehler: "Der Abschlag kann nicht mehr als 100 % betragen." };
  if (netto + bereitsAbgerechnetNetto > auftragssummeNetto + 0.005) {
    return { fehler: `Mit diesem Abschlag wären ${formatBetrag(netto + bereitsAbgerechnetNetto)} netto abgerechnet, das Angebot hat aber nur ${formatBetrag(auftragssummeNetto)} netto.` };
  }
  return { netto };
}

/** Eine Position für die Abschlagsrechnung (Leistungsbeschreibung nach § 14 UStG: Abschlag für das genannte Angebot/Projekt). */
export function abschlagBausteine(angebotBetreff: string, wahl: AbschlagWahl, netto: number, nummer: number): RechnungsBaustein[] {
  const anteil = wahl.modus === "prozent" ? ` (${formatZahl(wahl.prozent, { min: 0, max: 2 })} % der Auftragssumme)` : "";
  return [
    {
      typ: "position",
      kurztext: `${nummer}. Abschlagszahlung${anteil}`,
      langtext: `Abschlag auf die vereinbarte Leistung „${angebotBetreff}“. Die Leistung wird mit der Schlussrechnung abgerechnet, der Abschlag wird dort angerechnet.`,
      menge: 1,
      einheit: "psch",
      einzelpreis: netto,
    },
  ];
}

/** Betreff der Folgedokumente: „Gutschrift zur Rechnung R-2026-0001: …“. */
export function gutschriftBetreff(art: RechnungsArt, bezugNummer: string, betreff: string): string {
  const kopf = art === "storno" ? "Storno der Rechnung" : "Gutschrift zur Rechnung";
  return `${kopf} ${bezugNummer}: ${betreff}`.slice(0, 200);
}

/** Zahlbetrag der Schlussrechnung nach Abzug der Abschläge (Summe der Abschläge brutto vom Gesamtbetrag brutto). */
export function schlussZahlbetrag(gesamtBrutto: number, abschlaege: { brutto: number }[]): number {
  return aufCent(gesamtBrutto - abschlaege.reduce((s, a) => s + a.brutto, 0));
}

// ---------------------------------------------------------------------------
// Mahnung
// ---------------------------------------------------------------------------

/** Tage zwischen Fälligkeit und heute (nie negativ). */
export function tageUeberfaellig(faelligAm: string, heute: string): number {
  const t = Math.floor((Date.parse(`${heute}T12:00:00Z`) - Date.parse(`${faelligAm}T12:00:00Z`)) / 86_400_000);
  return t > 0 ? t : 0;
}

/** Beträge einer Mahnung: offener Betrag, Mahngebühr, Verzugszinsen (einfache Zinsen pro Jahr, auf Cent) und Summe. */
export function mahnBetraege(offen: number, tage: number, stufe: { zinsenProzent: number; gebuehr: number }): { offen: number; gebuehr: number; zinsen: number; summe: number } {
  const zinsen = stufe.zinsenProzent > 0 && tage > 0 ? aufCent((offen * stufe.zinsenProzent * tage) / 100 / 365) : 0;
  const gebuehr = aufCent(stufe.gebuehr);
  return { offen: aufCent(offen), gebuehr, zinsen, summe: aufCent(offen + gebuehr + zinsen) };
}
