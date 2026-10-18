// Sortieren und Filtern der Kontaktliste (reine Logik, getestet).

export type ListenKontakt = {
  id: string;
  kundennummer: string | null;
  typ: string;
  firmenname: string | null;
  vorname: string | null;
  nachname: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  mobil: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
  farbe?: string | null;
  bearbeitet_von?: string | null;
};

export const SORTIERUNGEN = {
  name_auf: "Name A → Z",
  name_ab: "Name Z → A",
  nummer_auf: "Nummer aufsteigend",
  nummer_ab: "Nummer absteigend",
  geaendert_neu: "Zuletzt bearbeitet: neueste zuerst",
  geaendert_alt: "Zuletzt bearbeitet: älteste zuerst",
  angelegt_neu: "Angelegt: neueste zuerst",
  angelegt_alt: "Angelegt: älteste zuerst",
} as const;
export type Sortierung = keyof typeof SORTIERUNGEN;

export function istSortierung(wert: unknown): wert is Sortierung {
  return typeof wert === "string" && wert in SORTIERUNGEN;
}

export const FEHLT = {
  telefon: "Telefonnummer",
  email: "E-Mail",
  adresse: "Adresse",
  kundennummer: "Kundennummer",
} as const;
export type Fehlt = keyof typeof FEHLT;

export function istFehlt(wert: unknown): wert is Fehlt {
  return typeof wert === "string" && wert in FEHLT;
}

const leer = (v: string | null | undefined) => !v || !v.trim();

/** Wonach wird alphabetisch sortiert? Firma: Firmenname, Person: Nachname, dann Vorname. */
export function sortierName(k: Pick<ListenKontakt, "firmenname" | "vorname" | "nachname">): string {
  return k.firmenname?.trim() || [k.nachname, k.vorname].filter(Boolean).join(" ").trim();
}

/** Fehlt dem Kontakt die gewünschte Angabe? */
export function fehltAngabe(k: ListenKontakt, was: Fehlt): boolean {
  switch (was) {
    case "telefon": return leer(k.telefon) && leer(k.mobil);
    case "email": return leer(k.email);
    case "adresse": return leer(k.strasse) || leer(k.plz) || leer(k.ort);
    case "kundennummer": return leer(k.kundennummer);
  }
}

export function kontakteSortieren<T extends ListenKontakt>(kontakte: readonly T[], sortierung: Sortierung): T[] {
  const nameVergleich = (a: T, b: T) => sortierName(a).localeCompare(sortierName(b), "de", { sensitivity: "base", numeric: true });
  const nachDatum = (feld: "created_at" | "updated_at", absteigend: boolean) => (a: T, b: T) =>
    (absteigend ? -1 : 1) * a[feld].localeCompare(b[feld]) || nameVergleich(a, b);
  // Nummer: leere ans Ende, sonst „natürlich“ (KD-2 vor KD-10)
  const nummer = (a: T, b: T) => {
    if (!a.kundennummer || !b.kundennummer) return a.kundennummer ? -1 : b.kundennummer ? 1 : 0;
    return a.kundennummer.localeCompare(b.kundennummer, "de", { sensitivity: "base", numeric: true });
  };
  const vergleich = {
    name_auf: nameVergleich,
    name_ab: (a: T, b: T) => nameVergleich(b, a),
    nummer_auf: (a: T, b: T) => nummer(a, b) || nameVergleich(a, b),
    nummer_ab: (a: T, b: T) => (!a.kundennummer || !b.kundennummer ? nummer(a, b) : nummer(b, a)) || nameVergleich(a, b),
    geaendert_neu: nachDatum("updated_at", true),
    geaendert_alt: nachDatum("updated_at", false),
    angelegt_neu: nachDatum("created_at", true),
    angelegt_alt: nachDatum("created_at", false),
  }[sortierung];
  return [...kontakte].sort(vergleich);
}

/** Alle vorkommenden Orte, alphabetisch, mit Anzahl. */
export function orteMitAnzahl(kontakte: readonly Pick<ListenKontakt, "ort">[]): { ort: string; anzahl: number }[] {
  const zaehler = new Map<string, number>();
  for (const k of kontakte) {
    const ort = k.ort?.trim();
    if (ort) zaehler.set(ort, (zaehler.get(ort) ?? 0) + 1);
  }
  return [...zaehler.entries()]
    .map(([ort, anzahl]) => ({ ort, anzahl }))
    .sort((a, b) => a.ort.localeCompare(b.ort, "de", { sensitivity: "base" }));
}
