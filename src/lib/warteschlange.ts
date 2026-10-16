// Warteschlange für Eingaben, die (noch) nicht beim Server angekommen sind.
//
// Regel aus CLAUDE.md: Formulare dürfen Eingaben nicht verlieren, wenn das
// Senden fehlschlägt. Deshalb wird jede Eingabe VOR dem Senden hier auf dem
// Gerät abgelegt und erst nach Erfolg wieder entfernt. Klappt das Senden nicht
// (Funkloch, abgelaufene Anmeldung), schickt die App sie später erneut. Die
// Server-Aktionen sind so gebaut, dass doppeltes Senden nichts doppelt speichert.
//
// Gespeichert wird pro Nutzer im localStorage. Ein Offline-Modus ist das nicht:
// Ohne Netz kann man nichts laden, nur Eingaben gehen nicht verloren.

export type Auftrag = {
  /** Eindeutig pro Vorgang (gleicher Schlüssel = neuere Fassung ersetzt die alte). */
  schluessel: string;
  /** Welche Server-Aktion den Auftrag ausführt, z. B. "zeit_anlegen". */
  typ: string;
  /** Kurze Beschreibung für die Anzeige, z. B. „16.10. · 8:30 Std · Gerdes“. */
  titel: string;
  nutzlast: unknown;
  erstelltAm: string;
  /** Meldung des Servers, wenn er den Auftrag abgelehnt hat (dann kein Neuversuch). */
  fehler?: string;
};

export const WARTESCHLANGE_EREIGNIS = "mb-warteschlange";

/** Zufällige UUID v4 für neue Einträge (auch dort, wo crypto.randomUUID fehlt). */
export function neueId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const VERSION = 1;

function schluesselFuer(userId: string): string {
  return `mb:warteschlange:v${VERSION}:${userId}`;
}

// --- reine Listen-Funktionen (getestet) -------------------------------------

export function mitAuftrag(liste: Auftrag[], auftrag: Auftrag): Auftrag[] {
  return [...liste.filter((a) => a.schluessel !== auftrag.schluessel), auftrag];
}

export function ohneAuftrag(liste: Auftrag[], schluessel: string): Auftrag[] {
  return liste.filter((a) => a.schluessel !== schluessel);
}

export function mitFehler(liste: Auftrag[], schluessel: string, fehler: string): Auftrag[] {
  return liste.map((a) => (a.schluessel === schluessel ? { ...a, fehler } : a));
}

export function listeLesen(text: string | null): Auftrag[] {
  if (!text) return [];
  try {
    const wert: unknown = JSON.parse(text);
    if (!Array.isArray(wert)) return [];
    return wert.filter(
      (a): a is Auftrag =>
        !!a && typeof a === "object" &&
        typeof (a as Auftrag).schluessel === "string" &&
        typeof (a as Auftrag).typ === "string" &&
        typeof (a as Auftrag).titel === "string",
    );
  } catch {
    return [];
  }
}

// --- Zugriff auf den Gerätespeicher ----------------------------------------
// localStorage kann fehlen oder Fehler werfen (privater Modus, voll) → nie abstürzen.

/** Roher Inhalt (für useSyncExternalStore: ein String ändert sich nur bei echten Änderungen). */
export function auftraegeRoh(userId: string): string | null {
  try {
    return window.localStorage.getItem(schluesselFuer(userId));
  } catch {
    return null;
  }
}

export function auftraegeLaden(userId: string): Auftrag[] {
  try {
    return listeLesen(window.localStorage.getItem(schluesselFuer(userId)));
  } catch {
    return [];
  }
}

function speichern(userId: string, liste: Auftrag[]): boolean {
  try {
    if (liste.length) window.localStorage.setItem(schluesselFuer(userId), JSON.stringify(liste));
    else window.localStorage.removeItem(schluesselFuer(userId));
    window.dispatchEvent(new Event(WARTESCHLANGE_EREIGNIS));
    return true;
  } catch {
    return false;
  }
}

/** Legt einen Auftrag ab. false = Gerätespeicher nicht nutzbar. */
export function auftragMerken(userId: string, auftrag: Omit<Auftrag, "erstelltAm">): boolean {
  return speichern(userId, mitAuftrag(auftraegeLaden(userId), { ...auftrag, erstelltAm: new Date().toISOString() }));
}

export function auftragEntfernen(userId: string, schluessel: string): void {
  speichern(userId, ohneAuftrag(auftraegeLaden(userId), schluessel));
}

export function auftragFehlerMerken(userId: string, schluessel: string, fehler: string): void {
  speichern(userId, mitFehler(auftraegeLaden(userId), schluessel, fehler));
}
