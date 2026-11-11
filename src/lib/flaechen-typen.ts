// Flächenberechnung aus dem Grundriss (Angebot → „Flächen aus Grundriss“): gemeinsame Typen für Einlesen, Rechnen und Oberfläche.
// Alle Maße in Metern bzw. m². Auch im Browser nutzbar.

/**
 * Raumart, wie sie die KI aus dem Plan liest (und wie man sie in der Tabelle ändert).
 * - wohnraum, bad, wc: Räume der Wohnungen (Standard bei „Aus Aufmaß“); in Bad und WC zählt die Wand nur oberhalb der Fliesen
 * - treppenhaus, technik, nebengebaeude: zählen nur, wenn man sie in der Position ausdrücklich als Bereich wählt
 * - aussen (Balkon, Terrasse, Dachterrasse): zählt NIE, weder Boden noch Decke, Wand oder Sockel
 */
export const RAUM_ARTEN = ["wohnraum", "bad", "wc", "treppenhaus", "technik", "nebengebaeude", "aussen"] as const;
export type RaumArt = (typeof RAUM_ARTEN)[number];

export const RAUM_ART_NAMEN: Record<RaumArt, string> = {
  wohnraum: "Wohnraum",
  bad: "Bad",
  wc: "WC",
  treppenhaus: "Treppenhaus",
  technik: "Technik",
  nebengebaeude: "Nebengebäude",
  aussen: "Balkon / Terrasse",
};

/** Räume der Wohnungen (Standard-Bereich). */
export const WOHNUNGS_ARTEN: readonly RaumArt[] = ["wohnraum", "bad", "wc"];
/** Nassräume: Wand nur oberhalb der Fliesen, kein Sockel-Vorschlag. */
export const NASS_ARTEN: readonly RaumArt[] = ["bad", "wc"];

/** Ein Raum der Tabelle. Leere Maße (null) bedeuten: Standardwert bzw. Schätzung verwenden. */
export type Raum = {
  /** Kennung nur für die Oberfläche (kein Datenbank-Schlüssel) */
  id: string;
  /** Geschoss wie im Plantitel, z. B. „Erdgeschoss“, „1. Obergeschoss“ */
  geschoss: string;
  /** Wohnung, falls im Plan erkennbar, sonst leer */
  wohnung: string;
  /** Raumname wie im Plan */
  name: string;
  /** Bodenfläche (lichte Raumfläche, DIN-F) in m²; null = nicht lesbar, bitte eintragen */
  boden: number | null;
  /** Gemessener Umfang in m; leer = geschätzt aus der Bodenfläche */
  umfang: number | null;
  /** Raumhöhe in m; leer = Standard */
  hoehe: number | null;
  /** Deckenfläche in m² von Hand; leer = Bodenfläche (im Treppenhaus Pflicht) */
  decke: number | null;
  art: RaumArt;
  /** Sockelleiste in diesem Raum einrechnen */
  sockel: boolean;
  /** Seite im PDF (0 = von Hand angelegt) */
  seite: number;
  /** Woher der Raum kommt */
  quelle: "ki" | "hand";
};

/** Einstellbare Standardwerte der Rechenregeln. */
export type FlaechenStandard = {
  /** Umfang geschätzt = Faktor × √Bodenfläche */
  umfangFaktor: number;
  /** Raumhöhe in m */
  raumhoehe: number;
  /** Pauschaler Abzug für Türen und Fenster in % der Wandfläche */
  abzugProzent: number;
  /** Fliesenhöhe in Bad/WC in m (Wand zählt nur darüber) */
  fliesenhoehe: number;
};

export const FLAECHEN_STANDARD: FlaechenStandard = { umfangFaktor: 4.3, raumhoehe: 2.5, abzugProzent: 10, fliesenhoehe: 1.5 };

/** Berechnete Mengen eines Raums. `geschaetzt` markiert Werte, die nicht gemessen, sondern geschätzt sind. */
export type RaumFlaechen = {
  /** verwendeter Umfang in m (gemessen oder geschätzt) */
  umfang: number;
  boden: number;
  /** null = fehlt (Treppenhaus ohne Eingabe) */
  decke: number | null;
  wand: number;
  /** Sockel in lfm (0, wenn der Raum keinen Sockel bekommt) */
  sockel: number;
  geschaetzt: { umfang: boolean; wand: boolean; decke: boolean; sockel: boolean };
};

export type FlaechenArt = "boden" | "decke" | "wand" | "sockel";

export const FLAECHEN_ART_NAMEN: Record<FlaechenArt, string> = { boden: "Boden", decke: "Decke", wand: "Wand", sockel: "Sockel" };
export const FLAECHEN_EINHEIT: Record<FlaechenArt, string> = { boden: "m²", decke: "m²", wand: "m²", sockel: "lfm" };

/**
 * Geltungsbereich einer Leistung.
 * - wohnungen: alle Räume der Wohnungen (optional nur ein Geschoss, optional ohne Bad/WC) – der Standard
 * - wohnung: eine im Plan erkannte Wohnung
 * - raumart: Treppenhaus, Technik oder Nebengebäude, nur wenn ausdrücklich gewählt
 * - raeume: einzelne Räume (ausdrücklich gewählt, außer Außenflächen)
 */
export type Bereich =
  | { art: "wohnungen"; geschoss?: string; ohneNass?: boolean }
  | { art: "wohnung"; wohnung: string }
  | { art: "raumart"; raumArt: "treppenhaus" | "technik" | "nebengebaeude" }
  | { art: "raeume"; ids: string[] };

/** Eine gewählte Leistung: Stammdaten-Leistung × Fläche eines Bereichs. Der Preis kommt nie von hier, sondern aus den Stammdaten. */
export type LeistungsZeile = {
  id: string;
  serviceId: string;
  flaeche: FlaechenArt;
  bereich: Bereich;
};

/** Ergebnis des Grundriss-Lesens. Bei Fehler steht `fehler` drin und es gibt keine Räume. */
export type GrundrissErgebnis = {
  raeume: Omit<Raum, "id" | "umfang" | "hoehe" | "decke" | "sockel">[];
  fehler?: string;
  /** Token-Verbrauch des Aufrufs (für die Kostenanzeige) */
  tokens?: { eingabe: number; ausgabe: number };
};
