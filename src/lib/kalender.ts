// Rechenlogik für Wochen- und Monatsansicht der Plantafel (auch im Browser nutzbar).

import { tageVerschieben } from "@/lib/datum";

export type KalEinsatz = {
  datum: string;
  fahrzeug: string;
  projekte: { id: string; name: string }[];
  mitarbeiterIds: string[];
};
export type KalTermin = { datum: string; titel: string; projectId: string | null; personIds: string[] };
export type KalAbwesenheit = {
  userId: string;
  von: string;
  bis: string;
  art: "urlaub" | "unbezahlter_urlaub";
  status: "offen" | "genehmigt";
};
export type KalKrank = { userId: string; datum: string };
export type KalDaten = {
  einsaetze: KalEinsatz[];
  termine: KalTermin[];
  abwesenheiten: KalAbwesenheit[];
  krank: KalKrank[];
};

/** Alle Tage von bis (einschließlich) als "JJJJ-MM-TT". */
export function tageListe(von: string, bis: string): string[] {
  const tage: string[] = [];
  for (let t = von; t <= bis; t = tageVerschieben(t, 1)) tage.push(t);
  return tage;
}

/** Montag der Woche, in der das Datum liegt. */
export function wochenAnfang(datum: string): string {
  const wochentag = new Date(`${datum}T12:00:00Z`).getUTCDay(); // 0 = Sonntag
  return tageVerschieben(datum, -((wochentag + 6) % 7));
}

export function istWochenende(datum: string): boolean {
  const w = new Date(`${datum}T12:00:00Z`).getUTCDay();
  return w === 0 || w === 6;
}

export type AbwesenheitsInfo = { text: "Urlaub" | "Unbezahlter Urlaub" | "Krank"; offen: boolean };

export type MitarbeiterZelle = {
  einsaetze: { fahrzeug: string; projekte: { id: string; name: string }[] }[];
  termine: string[];
  abwesend: AbwesenheitsInfo | null;
};

/** Was macht ein Mitarbeiter an einem Tag? */
export function mitarbeiterZelle(userId: string, datum: string, d: KalDaten): MitarbeiterZelle {
  let abwesend: AbwesenheitsInfo | null = null;
  const urlaub = d.abwesenheiten.filter((a) => a.userId === userId && a.von <= datum && datum <= a.bis);
  // Genehmigter Urlaub geht vor offenem
  const gen = urlaub.find((a) => a.status === "genehmigt") ?? urlaub[0];
  if (gen) abwesend = { text: gen.art === "urlaub" ? "Urlaub" : "Unbezahlter Urlaub", offen: gen.status === "offen" };
  if (d.krank.some((k) => k.userId === userId && k.datum === datum)) abwesend = { text: "Krank", offen: false };
  return {
    einsaetze: d.einsaetze
      .filter((e) => e.datum === datum && e.mitarbeiterIds.includes(userId))
      .map((e) => ({ fahrzeug: e.fahrzeug, projekte: e.projekte })),
    termine: d.termine.filter((t) => t.datum === datum && t.personIds.includes(userId)).map((t) => t.titel),
    abwesend,
  };
}

export type ProjektZelle = { autos: string[]; personIds: string[]; termine: string[] };

/** Wer ist an einem Tag auf einer Baustelle? */
export function projektZelle(projectId: string, datum: string, d: KalDaten): ProjektZelle {
  const einsaetze = d.einsaetze.filter((e) => e.datum === datum && e.projekte.some((p) => p.id === projectId));
  return {
    autos: einsaetze.map((e) => e.fahrzeug),
    personIds: [...new Set(einsaetze.flatMap((e) => e.mitarbeiterIds))],
    termine: d.termine.filter((t) => t.datum === datum && t.projectId === projectId).map((t) => t.titel),
  };
}

/** Projekte, die im Zeitraum vorkommen (Einsatz oder Termin), nach Name sortiert. */
export function projekteImZeitraum(d: KalDaten, namen: Map<string, string>): { id: string; name: string }[] {
  const ids = new Set<string>();
  for (const e of d.einsaetze) for (const p of e.projekte) ids.add(p.id);
  for (const t of d.termine) if (t.projectId) ids.add(t.projectId);
  return [...ids]
    .map((id) => ({ id, name: namen.get(id) ?? "Baustelle" }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
