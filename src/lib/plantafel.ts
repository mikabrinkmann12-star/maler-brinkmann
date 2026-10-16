// Reine Rechenlogik der Einteilung (Karten pro Auto). Im Browser und in Tests nutzbar.

import type { Stopp } from "@/lib/einsatz";

export type Karte = {
  assignmentId: string | null;
  vehicleId: string | null;
  stopps: Stopp[];
  mitarbeiterIds: string[];
  notiz: string;
};
export type Karten = Record<string, Karte>;

export const OHNE_AUTO = "ohne";
export const kartenSchluessel = (vehicleId: string | null) => vehicleId ?? OHNE_AUTO;

export function leererStopp(projectId: string): Stopp {
  return { projectId, zeit: null, zeitArt: null, notiz: "" };
}

/**
 * Person verschieben oder hinzufügen.
 * - von = Karte, nach = Karte: verschieben
 * - von = null (Mitarbeiter-Leiste), nach = Karte: hinzufügen
 * - nach = null: aus der Karte `von` herausnehmen
 */
export function personVerschieben(karten: Karten, personId: string, von: string | null, nach: string | null): Karten {
  const neu: Karten = structuredClone(karten);
  if (von && neu[von]) neu[von].mitarbeiterIds = neu[von].mitarbeiterIds.filter((id) => id !== personId);
  if (nach && neu[nach] && !neu[nach].mitarbeiterIds.includes(personId)) neu[nach].mitarbeiterIds.push(personId);
  return neu;
}

/** Baustelle als Stopp ergänzen (nicht doppelt). */
export function stoppHinzufuegen(karten: Karten, schluessel: string, projectId: string): Karten {
  if (!karten[schluessel] || karten[schluessel].stopps.some((s) => s.projectId === projectId)) return karten;
  const neu: Karten = structuredClone(karten);
  neu[schluessel].stopps.push(leererStopp(projectId));
  return neu;
}

export type TerminFuerPlan = {
  id: string;
  titel: string;
  projectId: string | null;
  personIds: string[];
};

/** Termin in ein Auto übernehmen: Personen ins Team, Baustelle (falls vorhanden) als Stopp. */
export function terminUebernehmen(karten: Karten, schluessel: string, termin: TerminFuerPlan): Karten {
  if (!karten[schluessel]) return karten;
  let neu: Karten = structuredClone(karten);
  for (const personId of termin.personIds) {
    if (!neu[schluessel].mitarbeiterIds.includes(personId)) neu[schluessel].mitarbeiterIds.push(personId);
  }
  if (termin.projectId) neu = stoppHinzufuegen(neu, schluessel, termin.projectId);
  return neu;
}

/** In welchen Karten steht die Person? */
export function kartenVonPerson(karten: Karten): Map<string, string[]> {
  const ergebnis = new Map<string, string[]>();
  for (const [s, k] of Object.entries(karten)) {
    for (const id of k.mitarbeiterIds) ergebnis.set(id, [...(ergebnis.get(id) ?? []), s]);
  }
  return ergebnis;
}
