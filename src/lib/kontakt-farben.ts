// Farbe eines Kontakts (wie in Plancraft: sechs Farbpunkte). Gespeichert wird der Name, nicht der Farbwert.

export const KONTAKT_FARBEN = [
  { id: "rot", name: "Rot", wert: "#e5484d" },
  { id: "orange", name: "Orange", wert: "#f5a524" },
  { id: "gruen", name: "Grün", wert: "#3fa66a" },
  { id: "blau", name: "Blau", wert: "#3b82f6" },
  { id: "lila", name: "Lila", wert: "#8b5cf6" },
  { id: "grau", name: "Grau", wert: "#6b7280" },
] as const;

export type KontaktFarbe = (typeof KONTAKT_FARBEN)[number]["id"];

export function istKontaktFarbe(wert: unknown): wert is KontaktFarbe {
  return KONTAKT_FARBEN.some((f) => f.id === wert);
}

/** Farbwert zu einem Namen; ohne Farbe ein ruhiges Grau. */
export function kontaktFarbwert(farbe: string | null | undefined): string {
  return KONTAKT_FARBEN.find((f) => f.id === farbe)?.wert ?? "#9ca3af";
}
