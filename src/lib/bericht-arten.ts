// Beschreibung aller Berichtsarten (Vorlage: Plancraft-Mitarbeiter-App, docs/PLANCRAFT-MITARBEITER-APP.md).
// Jede Art besteht aus Abschnitten mit Feldern. Aus dieser Beschreibung entstehen die Eingabe-Oberfläche (Assistent),
// die Prüfung auf dem Server, die Ansicht und das PDF. Eine neue Art = ein Eintrag hier + Name in `BERICHT_ARTEN`
// + die Erlaubnis in der Datenbank (Migration). Auch im Browser nutzbar.

export type Option = { wert: string; name: string };

/** Felder, die auch innerhalb eines Listen-Eintrags vorkommen dürfen. */
export type EinfachesFeld =
  | { schluessel: string; art: "text"; label: string; max?: number; zeilen?: number; platzhalter?: string; standard?: string }
  | { schluessel: string; art: "zahl"; label: string; einheit?: string; platzhalter?: string }
  | { schluessel: string; art: "datum"; label: string }
  | { schluessel: string; art: "auswahl"; label: string; optionen: Option[] }
  | { schluessel: string; art: "person"; label: string };

export type Feld =
  | EinfachesFeld
  /** Fester Text (nicht änderbar, nicht gespeichert) */
  | { schluessel: string; art: "festtext"; text: string }
  /** Abhaken: gespeichert wird die Liste der abgehakten Schlüssel */
  | { schluessel: string; art: "checkliste"; label: string; punkte: Option[] }
  /** Mehrere gleich aufgebaute Einträge („Messung hinzufügen“) */
  | { schluessel: string; art: "liste"; label: string; hinzufuegen: string; eintrag: EinfachesFeld[]; max: number }
  /** Fotos aus der Ablage des Projekts (IDs) */
  | { schluessel: string; art: "bilder" };

export type Abschnitt = { id: string; titel: string; felder: Feld[] };

export type Allgemein = {
  /** „Leistungszeitraum“ von–bis */
  zeitraum?: boolean;
  /** Wetterbedingung (Wetter + Temperatur) */
  wetter?: boolean;
  /** „Erstellt von“ (Auswahl einer Person) */
  erstelltVon?: boolean;
};

export type BerichtArtDef = { name: string; allgemein: Allgemein; abschnitte: Abschnitt[] };

export const BERICHT_ARTEN = [
  "abnahmeprotokoll",
  "aufmass",
  "baustellenbegehung",
  "bautagesbericht",
  "bedenkenanzeige",
  "besprechungsprotokoll",
  "checkliste",
  "einsatzbericht",
  "regiebericht",
] as const;
export type BerichtArt = (typeof BERICHT_ARTEN)[number];

export const MAX_FOTOS = 8;
export const TEXT_MAX = 4000;
export const KURZ_MAX = 300;

const text = (schluessel: string, label: string, zusatz: { max?: number; zeilen?: number; platzhalter?: string; standard?: string } = {}): EinfachesFeld => ({
  schluessel, art: "text", label, ...zusatz,
});
const zahl = (schluessel: string, label: string, zusatz: { einheit?: string; platzhalter?: string } = {}): EinfachesFeld => ({
  schluessel, art: "zahl", label, ...zusatz,
});

const BEREICHE: Option[] = [
  { wert: "meister", name: "Meister" },
  { wert: "facharbeiter", name: "Facharbeiter" },
  { wert: "hilfskraft", name: "Hilfskraft" },
  { wert: "azubi", name: "Azubi" },
];

const EINHEITEN: Option[] = ["Stk.", "m²", "m", "Liter", "kg", "Eimer", "Rolle", "Pkg.", "psch."].map((e) => ({ wert: e, name: e }));

const CHECKLISTE: Feld = {
  schluessel: "checkliste",
  art: "checkliste",
  label: "Checkliste",
  punkte: [
    { wert: "anforderung", name: "Kundenanforderung klären" },
    { wert: "aufmass", name: "Aufmaß nehmen" },
    { wert: "material", name: "Notwendige Materialien erfassen" },
  ],
};

const ALLGEMEIN: Abschnitt = { id: "allgemein", titel: "Allgemeine Informationen", felder: [] };
const BILDER: Abschnitt = { id: "bilder", titel: "Bilder", felder: [{ schluessel: "bilder", art: "bilder" }] };
const anmerkungen = (): Abschnitt => ({ id: "anmerkungen", titel: "Weitere Anmerkungen", felder: [text("anmerkungen", "Weitere Anmerkungen", { zeilen: 5 })] });

export const BERICHT_DEFS: Record<BerichtArt, BerichtArtDef> = {
  abnahmeprotokoll: {
    name: "Abnahmeprotokoll",
    allgemein: { zeitraum: true },
    abschnitte: [
      ALLGEMEIN,
      { id: "leistungen", titel: "Abgenommene Leistungen", felder: [text("leistungen", "Abgenommene Leistungen", { zeilen: 6 })] },
      {
        id: "maengel",
        titel: "Erfasste Mängel",
        felder: [
          {
            schluessel: "maengel", art: "liste", label: "Erfasste Mängel", hinzufuegen: "Mangel hinzufügen", max: 30,
            eintrag: [text("mangel", "Mangel", { zeilen: 3, max: 1000 }), { schluessel: "bis", art: "datum", label: "Zu erledigen bis" }],
          },
        ],
      },
      anmerkungen(),
      BILDER,
    ],
  },
  aufmass: {
    name: "Aufmaß",
    allgemein: {},
    abschnitte: [
      ALLGEMEIN,
      {
        id: "aufmass",
        titel: "Aufmaß",
        felder: [
          {
            schluessel: "messungen", art: "liste", label: "Aufmaß", hinzufuegen: "Messung hinzufügen", max: 60,
            eintrag: [text("bezeichnung", "Raum, Fläche oder Bauteil", { max: KURZ_MAX }), text("mass", "Aufmaß (z. B. 24,5 m²)", { max: 100 }), text("notiz", "Freitext", { zeilen: 2, max: 500 })],
          },
        ],
      },
    ],
  },
  baustellenbegehung: {
    name: "Baustellenbegehung",
    allgemein: { erstelltVon: true },
    abschnitte: [
      ALLGEMEIN,
      { id: "checkliste", titel: "Checkliste", felder: [CHECKLISTE] },
      { id: "angebot", titel: "Wichtig für die Angebotserstellung", felder: [text("angebot", "Wichtig für die Angebotserstellung", { zeilen: 6 })] },
      {
        id: "aufmass",
        titel: "Aufmaß",
        felder: [
          {
            schluessel: "aufmass", art: "liste", label: "Aufmaß", hinzufuegen: "Aufmaß hinzufügen", max: 60,
            eintrag: [text("bezeichnung", "Fläche oder Bauteil", { max: KURZ_MAX }), text("mass", "Aufmaß", { max: 100 }), text("notiz", "Freitext", { zeilen: 2, max: 500 })],
          },
        ],
      },
      BILDER,
      anmerkungen(),
    ],
  },
  bautagesbericht: {
    name: "Bautagesbericht",
    allgemein: { wetter: true },
    abschnitte: [
      ALLGEMEIN,
      {
        id: "mitarbeiter",
        titel: "Mitarbeiter",
        felder: [
          {
            schluessel: "mitarbeiter", art: "liste", label: "Mitarbeiter", hinzufuegen: "Mitarbeiter hinzufügen", max: 30,
            eintrag: [
              { schluessel: "person", art: "person", label: "Mitarbeiter" },
              { schluessel: "bereich", art: "auswahl", label: "Bereich", optionen: BEREICHE },
              zahl("anzahl", "Mitarbeiteranzahl", { platzhalter: "1" }),
              zahl("stunden", "Arbeitszeit (h)", { einheit: "h", platzhalter: "8" }),
            ],
          },
        ],
      },
      { id: "leistungen", titel: "Leistungen", felder: [text("leistungen", "Leistungen", { zeilen: 6 })] },
      { id: "material", titel: "Material", felder: [text("material", "Material", { zeilen: 4 })] },
      { id: "geraete", titel: "Geräte", felder: [text("geraete", "Geräte", { zeilen: 4 })] },
      { id: "vorkommnisse", titel: "Besondere Vorkommnisse", felder: [text("vorkommnisse", "Besondere Vorkommnisse", { zeilen: 4 })] },
      BILDER,
    ],
  },
  bedenkenanzeige: {
    name: "Bedenkenanzeige gemäß VOB/B §4 Abs. 3",
    allgemein: {},
    abschnitte: [
      ALLGEMEIN,
      {
        id: "text",
        titel: "Textfeld",
        felder: [{ schluessel: "festtext", art: "festtext", text: "Hiermit zeigen wir Bedenken hinsichtlich der Ausführung der Arbeiten gemäß VOB/B § 4 Abs. 3 an." }],
      },
      {
        id: "gegen",
        titel: "Bedenkenanzeige gegen",
        felder: [
          {
            schluessel: "gegen", art: "auswahl", label: "Bedenkenanzeige gegen",
            optionen: [
              { wert: "ausfuehrung", name: "die vorgesehene Art der Ausführung" },
              { wert: "leistung_anderer", name: "die Leistung anderer Unternehmer" },
              { wert: "material", name: "die Qualität der von Ihnen gelieferten Materialien bzw. Bauteile" },
            ],
          },
        ],
      },
      { id: "gruende", titel: "Gründe für die Bedenken", felder: [text("gruende", "Gründe für die Bedenken", { zeilen: 8 })] },
      {
        id: "frist",
        titel: "Frist",
        felder: [
          text("frist", "Frist", {
            zeilen: 10,
            standard:
              "Wir bitten um eine Klärung der Bedenken oder um Maßnahmen zur Behebung der beschriebenen Mängel innerhalb von 5 Werktagen ab dem Datum der Bedenkenanzeige. Erhalten wir von Ihnen keine Mitteilung, müssen wir annehmen, dass Sie unsere Bedenken nicht teilen und die weitere Ausführung gemäß Bauvertrag wünschen. Entstehen dadurch Mängel oder Schäden, übernehmen wir dafür keine Haftung und bitten Sie um die ausdrückliche Erklärung der Freistellung von Mängelansprüchen.",
          }),
        ],
      },
    ],
  },
  // In der Plancraft-Aufnahme nicht zu sehen: frei nach dem üblichen Aufbau gebaut (Teilnehmer, Themen, Vereinbarungen).
  besprechungsprotokoll: {
    name: "Besprechungsprotokoll",
    allgemein: { erstelltVon: true },
    abschnitte: [
      ALLGEMEIN,
      { id: "teilnehmer", titel: "Teilnehmer", felder: [text("teilnehmer", "Teilnehmer", { zeilen: 4 })] },
      { id: "themen", titel: "Besprochene Themen", felder: [text("themen", "Besprochene Themen", { zeilen: 8 })] },
      {
        id: "vereinbarungen",
        titel: "Vereinbarungen",
        felder: [
          {
            schluessel: "vereinbarungen", art: "liste", label: "Vereinbarungen", hinzufuegen: "Vereinbarung hinzufügen", max: 30,
            eintrag: [text("aufgabe", "Aufgabe oder Vereinbarung", { zeilen: 3, max: 1000 }), text("verantwortlich", "Verantwortlich", { max: 100 }), { schluessel: "bis", art: "datum", label: "Bis" }],
          },
        ],
      },
      BILDER,
      anmerkungen(),
    ],
  },
  checkliste: {
    name: "Checkliste",
    allgemein: {},
    abschnitte: [ALLGEMEIN, { id: "checkliste", titel: "Checkliste", felder: [CHECKLISTE] }, anmerkungen()],
  },
  einsatzbericht: {
    name: "Einsatzbericht",
    allgemein: {},
    abschnitte: [
      ALLGEMEIN,
      {
        id: "mitarbeiter",
        titel: "Mitarbeiter",
        felder: [
          {
            schluessel: "mitarbeiter", art: "liste", label: "Mitarbeiter", hinzufuegen: "Mitarbeiter hinzufügen", max: 30,
            eintrag: [{ schluessel: "person", art: "person", label: "Mitarbeiter" }, zahl("stunden", "Arbeitszeit (h)", { einheit: "h", platzhalter: "8" })],
          },
        ],
      },
      { id: "leistungen", titel: "Erbrachte Leistungen", felder: [text("leistungen", "Erbrachte Leistungen", { zeilen: 6 })] },
      BILDER,
      anmerkungen(),
    ],
  },
  regiebericht: {
    name: "Regiebericht",
    allgemein: { zeitraum: true },
    abschnitte: [
      ALLGEMEIN,
      {
        id: "mitarbeiter",
        titel: "Mitarbeiter",
        felder: [
          {
            schluessel: "mitarbeiter", art: "liste", label: "Mitarbeiter", hinzufuegen: "Mitarbeiter hinzufügen", max: 30,
            eintrag: [
              { schluessel: "person", art: "person", label: "Mitarbeiter" },
              zahl("stunden", "Arbeitszeit (h)", { einheit: "h", platzhalter: "8" }),
              text("leistung", "Erbrachte Leistung", { zeilen: 3, max: 1000 }),
            ],
          },
        ],
      },
      { id: "material", titel: "Material", felder: [text("material", "Material", { zeilen: 4 })] },
      {
        id: "materialien",
        titel: "Materialien",
        felder: [
          {
            schluessel: "materialien", art: "liste", label: "Materialien", hinzufuegen: "Material hinzufügen", max: 60,
            eintrag: [text("bezeichnung", "Material", { max: KURZ_MAX }), zahl("menge", "Menge"), { schluessel: "einheit", art: "auswahl", label: "Einheit", optionen: EINHEITEN }],
          },
        ],
      },
      anmerkungen(),
      BILDER,
    ],
  },
};

export const BERICHT_ART_NAMEN = Object.fromEntries(BERICHT_ARTEN.map((a) => [a, BERICHT_DEFS[a].name])) as Record<BerichtArt, string>;

export function istBerichtArt(wert: unknown): wert is BerichtArt {
  return typeof wert === "string" && (BERICHT_ARTEN as readonly string[]).includes(wert);
}
