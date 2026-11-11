// Rechnungen: Entwurf aus dem Angebot, Rechnungsarten und Rechnen (auch im Browser nutzbar).
// Die App vergibt Rechnungsnummer und PDF selbst (siehe rechnung-eigen.ts); es gibt keine Anbindung an ein Buchhaltungsprogramm.

import { angebotBerechnen, type Baustein, type Berechnung } from "@/lib/angebot";

export type RechnungStatus = "entwurf" | "wird_uebertragen" | "uebertragen";

/** Rechnungsarten der eigenen Rechnungen: Gutschrift und Storno haben negative Summen (Mengen und Preise bleiben positiv). */
export const RECHNUNGS_ARTEN = ["rechnung", "abschlag", "schluss", "gutschrift", "storno"] as const;
export type RechnungsArt = (typeof RECHNUNGS_ARTEN)[number];

export const RECHNUNGS_ART_NAMEN: Record<RechnungsArt, string> = {
  rechnung: "Rechnung",
  abschlag: "Abschlagsrechnung",
  schluss: "Schlussrechnung",
  gutschrift: "Gutschrift",
  storno: "Stornorechnung",
};

export function istRechnungsArt(wert: unknown): wert is RechnungsArt {
  return typeof wert === "string" && (RECHNUNGS_ARTEN as readonly string[]).includes(wert);
}

/** Gutschrift und Storno gehören in den eigenen Nummernkreis und haben negative Summen. */
export function istGutschriftArt(art: RechnungsArt): boolean {
  return art === "gutschrift" || art === "storno";
}

export const RECHNUNG_STATUS_NAMEN: Record<RechnungStatus, string> = {
  entwurf: "Entwurf",
  wird_uebertragen: "Wird übertragen …",
  uebertragen: "Fertiggestellt",
};

/** Baustein einer Rechnung (Position oder Text). Beträge in Euro, netto. */
export type RechnungsBaustein = {
  typ: "position" | "text";
  kurztext: string;
  langtext: string;
  menge: number | null;
  einheit: string;
  einzelpreis: number | null;
  /** Lohnanteil am Einzelpreis (netto, € je Einheit) für den Ausweis nach § 35a EStG; null/leer = unbekannt */
  lohnEinzel?: number | null;
};

/** Aus den Bausteinen eines Angebots werden Rechnungsbausteine: Positionen bleiben, Titel und Text werden Textzeilen, Zwischensummen und Bilder entfallen. */
export function bausteineAusAngebot(bausteine: Baustein[]): RechnungsBaustein[] {
  const aus: RechnungsBaustein[] = [];
  for (const b of bausteine) {
    if (b.typ === "position") {
      aus.push({ typ: "position", kurztext: b.kurztext, langtext: b.langtext, menge: b.menge, einheit: b.einheit, einzelpreis: b.einzelpreis });
    } else if (b.typ === "titel") {
      aus.push({ typ: "text", kurztext: b.kurztext, langtext: "", menge: null, einheit: "", einzelpreis: null });
    } else if (b.typ === "text") {
      aus.push({ typ: "text", kurztext: "", langtext: b.langtext, menge: null, einheit: "", einzelpreis: null });
    }
  }
  return aus;
}

/** Summen der Rechnung (gleiche Regeln wie beim Angebot). */
export function rechnungBerechnen(
  bausteine: RechnungsBaustein[],
  optionen: { rabattProzent: number; steuersatz: number; reverseCharge: boolean },
): Berechnung {
  const alsBaustein: Baustein[] = bausteine.map((b, i) => ({
    id: String(i), typ: b.typ, kurztext: b.kurztext, langtext: b.langtext, menge: b.menge, einheit: b.einheit, einzelpreis: b.einzelpreis, bildPfad: null,
  }));
  return angebotBerechnen(alsBaustein, optionen);
}

/** „Zahlbar innerhalb von 14 Tagen netto“ bzw. mit Skonto. */
export function zahlungsbedingungText(tage: number, skontoProzent: number | null, skontoTage: number | null): string {
  const netto = tage === 0 ? "Zahlbar sofort netto" : `Zahlbar innerhalb von ${tage} Tagen netto`;
  if (skontoProzent && skontoTage) {
    const prozent = String(skontoProzent).replace(".", ",");
    return `Bei Zahlung innerhalb von ${skontoTage} Tagen ${prozent} % Skonto, ${netto.charAt(0).toLowerCase()}${netto.slice(1)}`;
  }
  return netto;
}
