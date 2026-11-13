// Welche Oberfläche Admin/Büro bei Seiten der Mitarbeiter-App sehen (z. B. Chat, Berichte, Aufmaß eines Projekts):
// Standard ist der Büro-Rahmen mit Seitenleiste. Nur wer im Menü bewusst „Zur Mitarbeiter-Ansicht“ wählt, bekommt die Handy-Oberfläche.
// Gemerkt im Cookie, damit der Server beim Laden der Seite den richtigen Rahmen zeichnet. Rechte hängen davon nicht ab.

export const ANSICHT_COOKIE = "ansicht";
export type Ansicht = "buero" | "mitarbeiter";

/** Im Browser: Ansicht merken (gilt ab der nächsten Seite). */
export function ansichtMerken(ansicht: Ansicht) {
  document.cookie = `${ANSICHT_COOKIE}=${ansicht}; path=/; max-age=31536000; samesite=lax`;
}
