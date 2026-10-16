// Texte der Sortierungen (ohne server-only, damit auch die Filterleiste im Browser sie nutzen kann).
export const PROJEKT_SORT_TEXT = {
  neu: "Neueste zuerst",
  alt: "Älteste zuerst",
  name_auf: "Name A → Z",
  name_ab: "Name Z → A",
  geaendert: "Zuletzt bearbeitet",
} as const;
export type ProjektSortierungsName = keyof typeof PROJEKT_SORT_TEXT;
