// Stopps eines Einsatzes (auch im Browser nutzbar).
// Ein Auto hat ein festes Team und fährt an einem Tag mehrere Baustellen („Stopps“) an.
// Ohne Zeit entscheiden die Mitarbeiter selbst über die Reihenfolge; das Büro kann
// pro Stopp „muss da sein um“ (um) oder „kann ab“ (ab) eintragen.

export type StoppZeitArt = "um" | "ab";

export type Stopp = {
  projectId: string;
  /** "HH:MM" oder null */
  zeit: string | null;
  zeitArt: StoppZeitArt | null;
  notiz: string;
};

export const ZEIT_ART_TEXT: Record<StoppZeitArt, string> = {
  um: "muss da sein um",
  ab: "kann ab",
};

/** Kurztext für Mitarbeiter, z. B. „um 10:00 Uhr da sein“ oder „ab 12:30 Uhr“. Ohne Zeit leer. */
export function stoppZeitText(zeit: string | null | undefined, art: StoppZeitArt | null | undefined): string {
  if (!zeit || !art) return "";
  const uhr = zeit.slice(0, 5);
  return art === "um" ? `um ${uhr} Uhr da sein` : `ab ${uhr} Uhr`;
}

/**
 * Stopps in der Reihenfolge, die das Büro eingetragen hat (sortierung).
 * Zeiten ändern daran nichts: „kann ab 13:00“ heißt nur, dass man nicht früher kommen soll.
 */
export function stoppsSortieren<T extends { sortierung: number }>(stopps: readonly T[]): T[] {
  return [...stopps].sort((a, b) => a.sortierung - b.sortierung);
}

/** Einen Stopp um eine Position nach oben (-1) oder unten (+1) schieben. */
export function stoppVerschieben<T>(stopps: readonly T[], index: number, richtung: -1 | 1): T[] {
  const ziel = index + richtung;
  if (index < 0 || index >= stopps.length || ziel < 0 || ziel >= stopps.length) return [...stopps];
  const neu = [...stopps];
  [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
  return neu;
}
