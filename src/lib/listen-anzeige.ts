// Kleine Anzeigeregeln für Listen im Stil von Plancraft (auch im Browser nutzbar).
import { heuteIso, tageVerschieben } from "@/lib/datum";
import { formatDatum, formatUhrzeit } from "@/lib/format";

/** Zeitraum eines Projekts: „07.–25.05.2026“, „08.07. – 08.09.2026“, „13.10.2026“ oder „–“. */
export function zeitraumText(start: string | null | undefined, ende: string | null | undefined): string {
  const s = start || null;
  const e = ende || null;
  if (!s && !e) return "–";
  if (!e || !s || s === e) return formatDatum((s ?? e)!);
  const [sj, sm, st] = [s.slice(0, 4), s.slice(5, 7), s.slice(8, 10)];
  const [ej, em, et] = [e.slice(0, 4), e.slice(5, 7), e.slice(8, 10)];
  if (sj === ej && sm === em) return `${st}.–${et}.${em}.${ej}`;
  if (sj === ej) return `${st}.${sm}. – ${et}.${em}.${ej}`;
  return `${formatDatum(s)} – ${formatDatum(e)}`;
}

const WOCHENTAG_KURZ = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];

/** „Heute · 15:48“, „Gestern · 11:17“, sonst „Fr., 16.10.2026 · 09:14“. */
export function bearbeitetText(zeitpunkt: string | null | undefined, jetzt: Date = new Date()): string {
  if (!zeitpunkt) return "–";
  const tag = heuteIso(new Date(zeitpunkt));
  const heute = heuteIso(jetzt);
  const uhr = formatUhrzeit(zeitpunkt);
  if (tag === heute) return `Heute · ${uhr}`;
  if (tag === tageVerschieben(heute, -1)) return `Gestern · ${uhr}`;
  const wt = WOCHENTAG_KURZ[new Date(`${tag}T12:00:00Z`).getUTCDay()];
  return `${wt}, ${formatDatum(tag)} · ${uhr}`;
}

const KREIS_FARBEN = ["#e9b8d4", "#b8d4e9", "#c7e9b8", "#e9d4b8", "#cdb8e9", "#b8e9d6", "#e9b8b8", "#e9e2b8"];

/** Initialen und eine feste Pastellfarbe je Person (z. B. „RB“ in Rosa). */
export function personKreis(name: string): { initialen: string; farbe: string } {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  const initialen = ((teile[0]?.[0] ?? "") + (teile.length > 1 ? teile[teile.length - 1][0] : "")).toUpperCase() || "?";
  let summe = 0;
  for (const z of name) summe += z.charCodeAt(0);
  return { initialen, farbe: KREIS_FARBEN[summe % KREIS_FARBEN.length] };
}
