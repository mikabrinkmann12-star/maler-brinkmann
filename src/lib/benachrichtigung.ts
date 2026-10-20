// Benachrichtigungen im Büro (Glocke in der Seitenleiste, wie in Plancraft): Hinweise aus der Datenbank plus ungelesener Projektchat.
// Reine Logik, auch im Browser nutzbar.

export type Benachrichtigung = {
  /** Eindeutig über beide Arten hinweg, z. B. „h-12“ oder „c-<projekt>“ */
  id: string;
  art: "hinweis" | "chat";
  titel: string;
  text: string;
  href: string | null;
  zeit: string;
  gelesen: boolean;
  /** Nur bei Hinweisen: ID in der Tabelle `notifications` */
  hinweisId?: number;
};

const TITEL: Record<string, string> = {
  kollege_hinzugefuegt: "Kollege hinzugefügt",
  urlaubsantrag: "Urlaubsantrag",
  termin: "Termin",
  container: "Container",
  angebot_geoeffnet: "Angebot geöffnet",
};

export function hinweisTitel(typ: string): string {
  return TITEL[typ] ?? "Hinweis";
}

/** Wohin führt ein Hinweis? Baustelle bzw. Urlaubsanträge bzw. Termine. */
export function hinweisZiel(h: { typ: string; project_id: string | null }): string | null {
  if (h.project_id) return `/baustellen/${h.project_id}`;
  if (h.typ === "urlaubsantrag") return "/buero/urlaub";
  if (h.typ === "termin") return "/buero/plantafel/termine";
  if (h.typ === "container") return "/buero/container";
  return null;
}

export function chatText(anzahl: number, letzteNachricht: string | null): string {
  const kopf = anzahl === 1 ? "1 neue Nachricht" : `${anzahl} neue Nachrichten`;
  const vorschau = letzteNachricht?.trim().replace(/\s+/g, " ");
  return vorschau ? `${kopf}: ${vorschau.length > 80 ? `${vorschau.slice(0, 80)}…` : vorschau}` : kopf;
}

/** Neueste zuerst; Ungelesene stehen bei „Alle“ nicht vorn, sondern in der Zeitreihenfolge (wie in Plancraft). */
export function nachZeitSortieren(liste: readonly Benachrichtigung[]): Benachrichtigung[] {
  return [...liste].sort((a, b) => b.zeit.localeCompare(a.zeit));
}

export function ungelesene(liste: readonly Benachrichtigung[]): Benachrichtigung[] {
  return liste.filter((b) => !b.gelesen);
}
