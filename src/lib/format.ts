// Einheitliche deutsche Formatierung für die ganze App.
// Immer diese Funktionen nutzen, nie selbst mit toLocaleString & Co. formatieren.

export const ZEITZONE = "Europe/Berlin";

/** Wird angezeigt, wenn kein Wert vorhanden ist. */
export const LEER = "–";

const NUR_DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;

const datumFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: ZEITZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const datumZeitFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: ZEITZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const datumLangFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: ZEITZONE,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const uhrzeitFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: ZEITZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const betragFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

type DatumEingabe = Date | string | null | undefined;

function zuDate(wert: Date | string): Date | null {
  const datum = wert instanceof Date ? wert : new Date(wert);
  return Number.isNaN(datum.getTime()) ? null : datum;
}

/**
 * Datum als TT.MM.JJJJ.
 * Reine Kalenderdaten aus Postgres ("2026-10-15") werden ohne Zeitzonen-
 * Umrechnung übernommen, Zeitpunkte werden in deutscher Zeit angezeigt.
 */
export function formatDatum(wert: DatumEingabe): string {
  if (wert == null || wert === "") return LEER;
  if (typeof wert === "string") {
    const treffer = NUR_DATUM.exec(wert);
    if (treffer) return `${treffer[3]}.${treffer[2]}.${treffer[1]}`;
  }
  const datum = zuDate(wert);
  return datum ? datumFormat.format(datum) : LEER;
}

/** Datum mit Wochentag, z. B. „Donnerstag, 15.10.2026“. */
export function formatDatumLang(wert: DatumEingabe): string {
  if (wert == null || wert === "") return LEER;
  const datum =
    typeof wert === "string" && NUR_DATUM.test(wert)
      ? zuDate(`${wert}T12:00:00Z`) // Mittag UTC: sicher derselbe Tag in Berlin
      : zuDate(wert);
  return datum ? datumLangFormat.format(datum) : LEER;
}

/** Zeitpunkt als „TT.MM.JJJJ, HH:MM“ in deutscher Zeit. */
export function formatDatumZeit(wert: DatumEingabe): string {
  if (wert == null || wert === "") return LEER;
  const datum = zuDate(wert);
  return datum ? datumZeitFormat.format(datum) : LEER;
}

/** Uhrzeit als „HH:MM“ in deutscher Zeit. */
export function formatUhrzeit(wert: DatumEingabe): string {
  if (wert == null || wert === "") return LEER;
  const datum = zuDate(wert);
  return datum ? uhrzeitFormat.format(datum) : LEER;
}

/** Betrag als „1.234,56 €“ (mit geschütztem Leerzeichen vor dem €). */
export function formatBetrag(wert: number | null | undefined): string {
  if (wert == null || Number.isNaN(wert)) return LEER;
  return betragFormat.format(wert);
}

/** Zahl mit deutschem Komma, z. B. Mengen: „12,5“ oder „1.234,50“. */
export function formatZahl(
  wert: number | null | undefined,
  nachkommastellen: { min?: number; max?: number } = { min: 0, max: 2 },
): string {
  if (wert == null || Number.isNaN(wert)) return LEER;
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: nachkommastellen.min,
    maximumFractionDigits: nachkommastellen.max,
  }).format(wert);
}

/**
 * Stunden (Dezimalzahl aus der Datenbank) als „8:30 Std“.
 * Gerundet auf volle Minuten, damit 7,33 Std als „7:20 Std“ erscheint.
 */
export function formatStunden(stunden: number | null | undefined): string {
  if (stunden == null || Number.isNaN(stunden)) return LEER;
  const minuten = Math.round(Math.abs(stunden) * 60);
  const vorzeichen = stunden < 0 && minuten > 0 ? "-" : "";
  return `${vorzeichen}${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, "0")} Std`;
}

const tagKurzFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: ZEITZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/** Kurzer Tag mit Wochentag, z. B. „Do., 15.10.“. */
export function formatTagKurz(wert: string | null | undefined): string {
  if (!wert || !NUR_DATUM.test(wert)) return LEER;
  const datum = zuDate(`${wert}T12:00:00Z`);
  return datum ? tagKurzFormat.format(datum) : LEER;
}

const monatFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: ZEITZONE,
  month: "long",
  year: "numeric",
});

/** Monat „2026-10“ als „Oktober 2026“. */
export function formatMonat(monat: string | null | undefined): string {
  if (!monat || !/^\d{4}-\d{2}$/.test(monat)) return LEER;
  const datum = zuDate(`${monat}-15T12:00:00Z`);
  return datum ? monatFormat.format(datum) : LEER;
}
