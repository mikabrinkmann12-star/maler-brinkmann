// Darstellung je Nutzer: Farbsatz und Büro-Seitenleiste (Reihenfolge, ausgeblendete Punkte). Auch im Browser nutzbar.
// Reine Optik: Rechte bestimmen weiterhin, welche Punkte jemand überhaupt sieht.

/** Fertige Farbsätze. Die Werte stehen in globals.css ([data-akzent="…"]); alle haben weiße Schrift auf dem Knopf und sind auf Lesbarkeit geprüft. */
export const AKZENTE = ["gruen", "blau", "petrol", "graphit", "bordeaux"] as const;
export type Akzent = (typeof AKZENTE)[number];
export const STANDARD_AKZENT: Akzent = "gruen";

export const AKZENT_NAMEN: Record<Akzent, string> = {
  gruen: "Grün",
  blau: "Blau",
  petrol: "Petrol",
  graphit: "Graphit",
  bordeaux: "Bordeaux",
};

/** Name des Cookies, über den das Root-Layout den Farbsatz ohne Datenbank-Abfrage und ohne Aufblitzen setzt. */
export const AKZENT_COOKIE = "darstellung_akzent";
/** Cookie für den Glas-Look („1“ = an), ebenfalls fürs Root-Layout (`data-glas="an"` am <html>). */
export const GLAS_COOKIE = "darstellung_glas";

export function istAkzent(wert: unknown): wert is Akzent {
  return typeof wert === "string" && (AKZENTE as readonly string[]).includes(wert);
}

/** Gespeicherte Werte; null = Vorgabe (beim Nutzer: der Firma; bei der Firma: der App). */
export type Darstellung = {
  akzent: Akzent | null;
  /** Schlüssel der Menüpunkte (ihr Pfad) in gewünschter Reihenfolge */
  reihenfolge: string[] | null;
  /** Schlüssel der ausgeblendeten Menüpunkte */
  ausgeblendet: string[] | null;
  /** Glas-Look mit weichen Übergängen (Liquid Glass, Morph Motion); null = Vorgabe */
  glas: boolean | null;
};

export const LEERE_DARSTELLUNG: Darstellung = { akzent: null, reihenfolge: null, ausgeblendet: null, glas: null };

const schluesselListe = (wert: unknown): string[] | null =>
  Array.isArray(wert) ? [...new Set(wert.filter((s): s is string => typeof s === "string" && /^\/[a-z0-9/_-]{0,80}$/.test(s)))].slice(0, 50) : null;

/** Unsichere Eingabe (Formular, JSON aus app_settings) in eine gültige Darstellung verwandeln. */
export function darstellungPruefen(wert: unknown): Darstellung {
  const o = (typeof wert === "object" && wert !== null ? wert : {}) as Record<string, unknown>;
  return {
    akzent: istAkzent(o.akzent) ? o.akzent : null,
    reihenfolge: schluesselListe(o.reihenfolge),
    ausgeblendet: schluesselListe(o.ausgeblendet),
    glas: typeof o.glas === "boolean" ? o.glas : null,
  };
}

/** Was gilt: eigene Werte vor der Firmen-Vorgabe, sonst Standard der App. */
export function wirksameDarstellung(eigene: Darstellung, firma: Darstellung): { akzent: Akzent; reihenfolge: string[]; ausgeblendet: string[]; glas: boolean } {
  return {
    akzent: eigene.akzent ?? firma.akzent ?? STANDARD_AKZENT,
    reihenfolge: eigene.reihenfolge ?? firma.reihenfolge ?? [],
    ausgeblendet: eigene.ausgeblendet ?? firma.ausgeblendet ?? [],
    glas: eigene.glas ?? firma.glas ?? false,
  };
}

/**
 * Menüpunkte ordnen und ausblenden. `alle` = Schlüssel in der Standard-Reihenfolge (schon nach Rechten gefiltert).
 * Bekannte Schlüssel in `reihenfolge` kommen zuerst, neue Punkte (später hinzugekommen) hängen in Standard-Reihenfolge hinten an.
 * Die Übersicht („/buero“) lässt sich nie ausblenden, damit immer ein Weg zurück bleibt.
 */
export function menueOrdnen(alle: string[], reihenfolge: string[], ausgeblendet: string[]): string[] {
  const bekannt = reihenfolge.filter((s) => alle.includes(s));
  const rest = alle.filter((s) => !bekannt.includes(s));
  const weg = new Set(ausgeblendet.filter((s) => s !== "/buero"));
  return [...bekannt, ...rest].filter((s) => !weg.has(s));
}
