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

// Monate als "JJJJ-MM"
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;

export function istMonat(wert: unknown): wert is string {
  return typeof wert === "string" && MONAT.test(wert);
}

/** Monat um n Monate verschieben, z. B. ("2026-01", -1) → "2025-12". */
export function monatVerschieben(monat: string, n: number): string {
  const [jahr, m] = monat.split("-").map(Number);
  const gesamt = jahr * 12 + (m - 1) + n;
  return `${Math.floor(gesamt / 12)}-${String((gesamt % 12) + 1).padStart(2, "0")}`;
}

/** Erster und letzter Tag eines Monats als "JJJJ-MM-TT". */
export function monatsGrenzen(monat: string): { erster: string; letzter: string } {
  const [jahr, m] = monat.split("-").map(Number);
  const tage = new Date(Date.UTC(jahr, m, 0)).getUTCDate();
  return { erster: `${monat}-01`, letzter: `${monat}-${String(tage).padStart(2, "0")}` };
}
