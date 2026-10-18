// Anordnung der Übersichts-Seite (Mika, 18.10.2026: „Anpassen“ wie in Plancraft, Kästen ein-/ausblenden und nach oben/unten schieben).
// Gespeichert wird die Wahl in einem Cookie dieses Browsers; der Server liest sie beim Aufbau der Seite (kein Springen nach dem Laden).
// Reine Logik, auch im Browser nutzbar.

export type Spalte = "links" | "rechts";

export const WIDGETS = [
  { id: "zuletzt", spalte: "links", titel: "Zuletzt bearbeitete Projekte", beschreibung: "Die fünf zuletzt geänderten Projekte mit Status." },
  { id: "forderungen", spalte: "links", titel: "Offene Forderungen", beschreibung: "Summe der offenen Rechnungen, aufgeteilt in Offen und Überfällig, mit wählbarem Zeitraum." },
  { id: "einsatz", spalte: "links", titel: "Heute im Einsatz", beschreibung: "Wer ist heute mit welchem Auto wo, und wer fehlt." },
  { id: "projektstatus", spalte: "links", titel: "Projekte nach Status", beschreibung: "Wie viele Projekte stehen in welchem Status." },
  { id: "angebote", spalte: "links", titel: "Offene Angebote", beschreibung: "Versendete Angebote ohne Antwort, mit Summe." },
  { id: "wetter", spalte: "rechts", titel: "Wetter", beschreibung: "Wetter in Saterland, heute und die nächsten Stunden." },
  { id: "aufgaben", spalte: "rechts", titel: "Zu erledigen", beschreibung: "Urlaubsanträge, Chat-Nachrichten und Entwürfe, die auf dich warten." },
  { id: "hinweise", spalte: "rechts", titel: "Hinweise", beschreibung: "Neue Meldungen, z. B. wenn ein Mitarbeiter einen Kollegen hinzufügt." },
  { id: "material", spalte: "rechts", titel: "Material-Meldungen", beschreibung: "Material, das die Mitarbeiter auf den Baustellen gemeldet haben." },
] as const;

export type WidgetId = (typeof WIDGETS)[number]["id"];
export type DashboardLayout = Record<Spalte, WidgetId[]>;

export const LAYOUT_COOKIE = "dashboard-layout";

export const STANDARD_LAYOUT: DashboardLayout = {
  links: WIDGETS.filter((w) => w.spalte === "links").map((w) => w.id),
  rechts: WIDGETS.filter((w) => w.spalte === "rechts").map((w) => w.id),
};

const spalteVon = (id: string): Spalte | undefined => WIDGETS.find((w) => w.id === id)?.spalte;

/** Gespeicherte Wahl lesen. Alles Ungültige (kaputter Text, fremde oder doppelte Einträge, Eintrag in der falschen Spalte) wird verworfen. */
export function layoutLesen(roh: string | null | undefined): DashboardLayout {
  if (!roh) return STANDARD_LAYOUT;
  try {
    const wert: unknown = JSON.parse(decodeURIComponent(roh));
    if (typeof wert !== "object" || wert === null) return STANDARD_LAYOUT;
    const bereinigt = (spalte: Spalte): WidgetId[] => {
      const liste = (wert as Record<string, unknown>)[spalte];
      if (!Array.isArray(liste)) return STANDARD_LAYOUT[spalte];
      const gesehen = new Set<string>();
      return liste.filter((id): id is WidgetId => {
        if (typeof id !== "string" || spalteVon(id) !== spalte || gesehen.has(id)) return false;
        gesehen.add(id);
        return true;
      });
    };
    return { links: bereinigt("links"), rechts: bereinigt("rechts") };
  } catch {
    return STANDARD_LAYOUT;
  }
}

export function layoutSchreiben(layout: DashboardLayout): string {
  return encodeURIComponent(JSON.stringify(layout));
}

/** Eintrag an Position `index` um eine Stelle nach oben oder unten schieben (am Rand bleibt alles, wie es ist). */
export function verschieben<T>(liste: readonly T[], index: number, richtung: "hoch" | "runter"): T[] {
  const ziel = richtung === "hoch" ? index - 1 : index + 1;
  if (index < 0 || index >= liste.length || ziel < 0 || ziel >= liste.length) return [...liste];
  const kopie = [...liste];
  [kopie[index], kopie[ziel]] = [kopie[ziel], kopie[index]];
  return kopie;
}

/**
 * Liste für den Anpassen-Dialog einer Spalte: erst die sichtbaren Kästen in ihrer Reihenfolge, danach die ausgeblendeten
 * (in der Standardreihenfolge). `an` sagt, ob der Kasten sichtbar ist.
 */
export function dialogListe(spalte: Spalte, sichtbar: readonly WidgetId[]): { id: WidgetId; an: boolean }[] {
  const alle = WIDGETS.filter((w) => w.spalte === spalte).map((w) => w.id);
  return [...sichtbar.map((id) => ({ id, an: true })), ...alle.filter((id) => !sichtbar.includes(id)).map((id) => ({ id, an: false }))];
}
