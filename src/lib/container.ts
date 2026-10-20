// Container melden: Papier und Restmüll haben je eine eigene 7-Tage-Sperre für alle Mitarbeiter (die Regel erzwingt die Datenbank,
// hier steht nur die Anzeige). Reine Logik, auch im Browser nutzbar.

export type ContainerArt = "papier" | "restmuell";
export const CONTAINER_ARTEN: ContainerArt[] = ["papier", "restmuell"];
export const CONTAINER_NAMEN: Record<ContainerArt, string> = { papier: "Papiercontainer", restmuell: "Restmüllcontainer" };
export const SPERRE_TAGE = 7;

export function istContainerArt(wert: unknown): wert is ContainerArt {
  return wert === "papier" || wert === "restmuell";
}

export type ContainerMeldung = {
  id: string;
  art: ContainerArt;
  /** Zeitpunkt der Meldung (ISO) */
  zeit: string;
  wer: string;
  erledigt: boolean;
  notiz: string;
  /** Hat das Büro die Sperre vorzeitig aufgehoben? */
  freigegeben: boolean;
};

const TAG_MS = 24 * 60 * 60 * 1000;

/** Bis wann ist die Art gesperrt? Leer = frei. Nimmt die jüngste Meldung, die nicht freigegeben ist. */
export function sperreBis(meldungen: ContainerMeldung[], art: ContainerArt, jetzt: Date = new Date()): Date | null {
  const letzte = meldungen
    .filter((m) => m.art === art && !m.freigegeben)
    .map((m) => new Date(m.zeit).getTime())
    .sort((a, b) => b - a)[0];
  if (letzte === undefined) return null;
  const bis = new Date(letzte + SPERRE_TAGE * TAG_MS);
  return bis.getTime() > jetzt.getTime() ? bis : null;
}

/** „noch 6 Tage“, „noch 1 Tag“, „noch weniger als 1 Tag“ */
export function restText(bis: Date, jetzt: Date = new Date()): string {
  const tage = Math.ceil((bis.getTime() - jetzt.getTime()) / TAG_MS);
  if (tage <= 1) return "noch bis morgen";
  return `noch ${tage} Tage`;
}

/** Die jüngste nicht freigegebene Meldung der Art (zeigt, wer sie gemeldet hat). */
export function letzteMeldung(meldungen: ContainerMeldung[], art: ContainerArt): ContainerMeldung | null {
  return [...meldungen].filter((m) => m.art === art && !m.freigegeben).sort((a, b) => b.zeit.localeCompare(a.zeit))[0] ?? null;
}
