// Kalenderdaten als "JJJJ-MM-TT" (wie Postgres "date"), immer in deutscher Zeit.

import { ZEITZONE } from "@/lib/format";

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Heutiges Datum in Deutschland, z. B. "2026-10-15". */
export function heuteIso(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: ZEITZONE }).format(jetzt);
}

export function istIsoDatum(wert: unknown): wert is string {
  if (typeof wert !== "string" || !ISO_DATUM.test(wert)) return false;
  const d = new Date(`${wert}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === wert;
}

/** Datum um n Tage verschieben (n darf negativ sein). */
export function tageVerschieben(iso: string, tage: number): string {
  const d = new Date(`${iso}T12:00:00Z`); // Mittag: keine Probleme mit Sommerzeit
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}
