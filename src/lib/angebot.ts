// Angebote: Rechnen, Positionsnummern, Eingaben lesen (auch im Browser nutzbar).
// Alle Beträge werden in ganzen Cent gerechnet, damit keine Fließkomma-Fehler entstehen.

export type BausteinTyp = "position" | "titel" | "text" | "zwischensumme" | "bild";
export type AngebotStatus = "entwurf" | "versendet" | "angenommen" | "abgelehnt";

export const STATUS_NAMEN: Record<AngebotStatus, string> = {
  entwurf: "Entwurf",
  versendet: "Versendet",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
};

export const BAUSTEIN_NAMEN: Record<BausteinTyp, string> = {
  position: "Position",
  titel: "Titel",
  text: "Text",
  zwischensumme: "Zwischensumme",
  bild: "Bild",
};

export function istAngebotStatus(wert: unknown): wert is AngebotStatus {
  return wert === "entwurf" || wert === "versendet" || wert === "angenommen" || wert === "abgelehnt";
}

export const REVERSE_CHARGE_TEXT =
  "Gemäß § 13b UStG gilt die Steuerschuldnerschaft des Leistungsempfängers (Reverse-Charge). Es wird keine Umsatzsteuer ausgewiesen.";

export const STANDARD_EINLEITUNG = "Sehr geehrte Damen und Herren,\nanbei schicken wir Ihnen das angeforderte Angebot. Dieses lautet wie folgt:";
export const STANDARD_SCHLUSSTEXT =
  "Für Rückfragen zu diesem Angebot stehen wir Ihnen gerne zur Verfügung.\nDieses Schreiben wurde maschinell erstellt und ist deshalb auch ohne Unterschrift gültig.\nFalls Ihnen das Angebot zusagt, senden Sie es bitte unterschrieben zurück.";

/** Ein Baustein, wie ihn die Rechnung braucht (Beträge in Euro). */
export type Baustein = {
  id: string;
  typ: BausteinTyp;
  kurztext: string;
  langtext: string;
  menge: number | null;
  einheit: string;
  einzelpreis: number | null;
  bildPfad: string | null;
};

export type BerechneteZeile = {
  baustein: Baustein;
  /** Positionsnummer, z. B. „3.“ oder „2.1“; leer bei Text, Zwischensumme und Bild */
  nummer: string;
  /** Gesamtpreis der Position (Menge × Einzelpreis), sonst null */
  gesamt: number | null;
  /** Nur bei Zwischensumme: Summe seit der letzten Zwischensumme bzw. dem Anfang */
  zwischensumme: number | null;
};

export type Berechnung = {
  zeilen: BerechneteZeile[];
  netto: number;
  rabattProzent: number;
  rabatt: number;
  nettoNachRabatt: number;
  steuersatz: number;
  ust: number;
  brutto: number;
  reverseCharge: boolean;
};

const inCent = (euro: number) => Math.round(euro * 100);

/** Auf ganze Zahl runden, 0,5 weg von null (kaufmännisch). */
function runden(wert: number): number {
  return wert < 0 ? -Math.floor(-wert + 0.5) : Math.floor(wert + 0.5);
}

/** Menge (3 Nachkommastellen) × Einzelpreis (Cent) → Cent. */
export function positionCent(menge: number, einzelpreis: number): number {
  const mengeTausendstel = Math.round(menge * 1000);
  return runden((mengeTausendstel * inCent(einzelpreis)) / 1000);
}

/** Menge × Einzelpreis in Euro, auf Cent gerundet. */
export function positionGesamt(menge: number, einzelpreis: number): number {
  return positionCent(menge, einzelpreis) / 100;
}

/** Nummern vergeben: ohne Titel „1.“, „2.“ …; mit Titeln „1.“ (Titel), „1.1“, „1.2“ … */
export function angebotBerechnen(
  bausteine: Baustein[],
  optionen: { rabattProzent: number; steuersatz: number; reverseCharge: boolean },
): Berechnung {
  const hatTitel = bausteine.some((b) => b.typ === "titel");
  let laufend = 0;
  let gruppe = 0;
  let inGruppe = 0;
  let summeCent = 0;
  let seitZwischensumme = 0;

  const zeilen: BerechneteZeile[] = bausteine.map((baustein) => {
    let nummer = "";
    let gesamt: number | null = null;
    let zwischen: number | null = null;

    if (baustein.typ === "titel") {
      gruppe += 1;
      inGruppe = 0;
      nummer = `${gruppe}.`;
    } else if (baustein.typ === "position") {
      if (hatTitel) {
        if (gruppe === 0) gruppe = 1; // Positionen vor dem ersten Titel bilden eine eigene Gruppe
        inGruppe += 1;
        nummer = `${gruppe}.${inGruppe}`;
      } else {
        laufend += 1;
        nummer = `${laufend}.`;
      }
      const cent = positionCent(baustein.menge ?? 0, baustein.einzelpreis ?? 0);
      gesamt = cent / 100;
      summeCent += cent;
      seitZwischensumme += cent;
    } else if (baustein.typ === "zwischensumme") {
      zwischen = seitZwischensumme / 100;
      seitZwischensumme = 0;
    }
    return { baustein, nummer, gesamt, zwischensumme: zwischen };
  });

  const rabattHundertstel = Math.round(optionen.rabattProzent * 100);
  const rabattCent = runden((summeCent * rabattHundertstel) / 10_000);
  const nettoNachCent = summeCent - rabattCent;
  const satz = optionen.reverseCharge ? 0 : Math.round(optionen.steuersatz);
  const ustCent = runden((nettoNachCent * satz) / 100);

  return {
    zeilen,
    netto: summeCent / 100,
    rabattProzent: optionen.rabattProzent,
    rabatt: rabattCent / 100,
    nettoNachRabatt: nettoNachCent / 100,
    steuersatz: satz,
    ust: ustCent / 100,
    brutto: (nettoNachCent + ustCent) / 100,
    reverseCharge: optionen.reverseCharge,
  };
}

// ---------------------------------------------------------------------------
// Eingaben lesen
// ---------------------------------------------------------------------------

/**
 * Zahl aus deutscher Eingabe lesen: „12,5“, „1.234,56“, „-3“, „12,50 €“. Mit Komma sind Punkte Tausendertrenner;
 * ohne Komma gilt ein Punkt mit genau drei Ziffern danach als Tausendertrenner. Mehr Nachkommastellen als erlaubt
 * oder Unlesbares → null.
 */
export function zahlLesen(text: string, maxNachkomma: number): number | null {
  let t = text.replace(/[€\s]|eur$/gi, "");
  if (t === "") return null;
  let minus = false;
  if (t.startsWith("-") || t.startsWith("−")) {
    minus = true;
    t = t.slice(1);
  }
  let normal: string;
  if (t.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$/.test(t)) return null;
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    normal = t.replace(/\./g, "");
  } else if (/^\d+(\.\d+)?$/.test(t)) {
    normal = t;
  } else {
    return null;
  }
  const nachkomma = normal.split(".")[1]?.length ?? 0;
  if (nachkomma > maxNachkomma) return null;
  const wert = Number(normal);
  if (!Number.isFinite(wert)) return null;
  return minus ? -wert : wert;
}

export const mengeLesen = (text: string) => zahlLesen(text, 3);
export const einzelpreisLesen = (text: string) => zahlLesen(text, 2);

/** Zahl für ein Eingabefeld: deutsches Komma, ohne Tausenderpunkte, ohne überflüssige Nullen (mindestens `min` Stellen). */
export function zahlFuerFeld(wert: number, min = 0): string {
  const text = String(Math.round(wert * 1000) / 1000);
  const [ganz, nach = ""] = text.split(".");
  return nach.length >= min ? (nach ? `${ganz},${nach}` : ganz) : `${ganz},${nach.padEnd(min, "0")}`;
}
