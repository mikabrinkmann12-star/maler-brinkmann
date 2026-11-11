// Flächenberechnung aus dem Grundriss (Angebot → „Flächen aus Grundriss“): gemeinsame Typen für Einlesen, Rechnen und Oberfläche.
// Alle Maße in Metern bzw. m². Auch im Browser nutzbar.

/** Raumart: steuert Wand (Bad/WC nur oberhalb der Fliesen), Decke (Treppenhaus von Hand) und den Sockel-Vorschlag. */
export type RaumArt = "normal" | "nass" | "treppenhaus" | "technik" | "aussen";

export const RAUM_ART_NAMEN: Record<RaumArt, string> = {
  normal: "Wohnraum",
  nass: "Bad / WC",
  treppenhaus: "Treppenhaus",
  technik: "Technik",
  // Balkon, Terrasse, Dachterrasse: zählen nur beim Boden, nie bei Decke, Wand oder Sockel
  aussen: "Balkon / Terrasse",
};

/** Ein Raum, wie er geprüft wird. Leere Maße (null) bedeuten: Standardwert bzw. Schätzung verwenden. */
export type Raum = {
  /** Kennung nur für die Oberfläche (kein Datenbank-Schlüssel) */
  id: string;
  geschoss: string;
  name: string;
  /** Bodenfläche in m² (aus dem Grundriss oder von Hand) */
  boden: number | null;
  /** Gemessener Umfang in m; leer = geschätzt aus der Bodenfläche */
  umfang: number | null;
  /** Raumhöhe in m; leer = Standard */
  hoehe: number | null;
  /** Deckenfläche in m² von Hand; leer = Bodenfläche (im Treppenhaus Pflicht) */
  decke: number | null;
  art: RaumArt;
  /** Raum hat einen Bodenbelag (nur dann gibt es Sockelleisten) */
  belag: boolean;
  /** Sockelleiste in diesem Raum einrechnen */
  sockel: boolean;
  /** Vom Büro geprüft; nur geprüfte Räume dürfen ins Angebot */
  geprueft: boolean;
  /** Woher der Raum kommt */
  quelle: "pdf" | "ki" | "hand";
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

/** Geltungsbereich einer Leistung: alle Räume, ein Geschoss oder ausgewählte Räume. */
export type Bereich = { art: "alle" } | { art: "geschoss"; geschoss: string } | { art: "raeume"; ids: string[] };

/** Eine gewählte Leistung: Stammdaten-Leistung × Fläche eines Bereichs. Der Preis kommt nie von hier, sondern aus den Stammdaten. */
export type LeistungsZeile = {
  id: string;
  serviceId: string;
  flaeche: FlaechenArt;
  bereich: Bereich;
};

/** Ergebnis des Grundriss-Lesens: Räume (ungeprüft) und ein Hinweis, wie sie gelesen wurden. */
export type GrundrissErgebnis = {
  raeume: Omit<Raum, "id">[];
  /** „pdf“ = Text aus dem PDF, „ki“ = KI-Anbindung, „keine“ = nichts gefunden */
  verfahren: "pdf" | "ki" | "keine";
  hinweis?: string;
};
