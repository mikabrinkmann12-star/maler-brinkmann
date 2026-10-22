// Namen-Erkennung für die Spracheingabe bei der Einteilung (ohne externe KI).
//
// Aus einem Satz wie
//   "ähm Sebastian und Jan mit Sprinter eins zu Gerdes, Tobias mit dem Caddy nach Ringstraße"
// werden Gruppen: { Auto, Baustelle, Mitarbeiter[] }.
// Erkannt wird über die bekannten Listen (Mitarbeiter, Autos, Baustellen),
// unscharf (ein Tippfehler bzw. Hörfehler ist erlaubt). Füllwörter fallen
// automatisch weg, weil sie zu nichts passen.
//
// Austauschbar: Später kann eine KI (Jarvis) dieselbe Schnittstelle liefern.

export type ErkennungsMitarbeiter = { id: string; vorname: string; nachname: string };
export type ErkennungsFahrzeug = { id: string; name: string; kennzeichen: string | null };
export type ErkennungsProjekt = {
  id: string;
  name: string;
  /** Kundenname (Nachname oder Firma), Ort, Straße – alles, was man sagen könnte. */
  stichworte: string[];
};

export type EinteilungsGruppe = {
  fahrzeugId: string | null;
  projektId: string | null;
  mitarbeiterIds: string[];
};

export type ErkennungsErgebnis = {
  gruppen: EinteilungsGruppe[];
  /** Verständliche Hinweise, z. B. bei mehrdeutigen Namen. */
  hinweise: string[];
};

const ZAHLWOERTER: Record<string, string> = {
  eins: "1", ein: "1", eine: "1", einen: "1", zwei: "2", zwo: "2", drei: "3", vier: "4",
  fuenf: "5", sechs: "6", sieben: "7", acht: "8", neun: "9", zehn: "10",
};

// Wörter, die nie eine Baustelle oder Person bezeichnen
const STOPPWOERTER = new Set([
  "aeh", "aehm", "aehh", "hm", "hmm", "ehm", "oeh", "also", "ja", "nein", "und", "oder", "mit", "nach",
  "zu", "zum", "zur", "bei", "beim", "auf", "die", "der", "das", "den", "dem", "des", "ein", "eine",
  "heute", "morgen", "faehrt", "fahren", "fahrt", "kommt", "kommen", "ist", "sind", "im", "in", "am",
  "an", "von", "vom", "fuer", "dann", "noch", "auch", "bitte", "mal", "so", "sowie", "plus", "wieder",
  "baustelle", "projekt", "auto", "wagen", "firmenwagen", "team", "leute", "jungs", "strasse", "str",
  "weg", "haus", "wohnung", "familie", "herr", "frau", "gmbh", "co", "kg", "eg", "nicht",
]);

/** Kleinbuchstaben, Umlaute ausschreiben, Satzzeichen weg. */
export function normalisieren(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue").replaceAll("ß", "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function woerter(text: string): string[] {
  const n = normalisieren(text);
  return n ? n.split(" ").map((w) => ZAHLWOERTER[w] ?? w) : [];
}

/** Abstand zweier Wörter (Anzahl Tippfehler), mit frühem Abbruch. */
export function abstand(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let vorher = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const jetzt = [i];
    let zeilenMin = i;
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      jetzt[j] = Math.min(vorher[j] + 1, jetzt[j - 1] + 1, vorher[j - 1] + kosten);
      zeilenMin = Math.min(zeilenMin, jetzt[j]);
    }
    if (zeilenMin > max) return max + 1;
    vorher = jetzt;
  }
  return vorher[b.length];
}

/** Passt ein gesprochenes Wort zu einem bekannten Wort? Kurze Wörter nur exakt. */
function passt(gesprochen: string, bekannt: string): boolean {
  if (gesprochen === bekannt) return true;
  if (bekannt.length < 5 || /\d/.test(bekannt)) return false;
  return abstand(gesprochen, bekannt, 1) <= 1;
}

type Fund =
  | { art: "mitarbeiter"; ids: string[]; laenge: number; wort: string }
  | { art: "fahrzeug"; id: string; laenge: number }
  | { art: "projekt"; id: string; laenge: number };

export function einteilungErkennen(
  text: string,
  daten: {
    mitarbeiter: ErkennungsMitarbeiter[];
    fahrzeuge: ErkennungsFahrzeug[];
    projekte: ErkennungsProjekt[];
  },
): ErkennungsErgebnis {
  const w = woerter(text);
  const hinweise: string[] = [];

  // Vorbereitete Wortlisten
  const fahrzeugWorte = daten.fahrzeuge.map((f) => ({
    id: f.id,
    name: woerter(f.name),
    kennzeichen: woerter(f.kennzeichen ?? ""),
  }));
  const mitarbeiterWorte = daten.mitarbeiter.map((m) => ({
    id: m.id,
    vorname: woerter(m.vorname),
    nachname: woerter(m.nachname),
  }));
  const projektWorte = daten.projekte.map((p) => ({
    id: p.id,
    worte: new Set(
      [p.name, ...p.stichworte]
        .flatMap(woerter)
        .filter((x) => x.length >= 3 && !STOPPWOERTER.has(x) && !/^\d+$/.test(x)),
    ),
  }));

  // Wörter, die bei sehr vielen Baustellen vorkommen, sagen nichts aus
  const projektZaehler = new Map<string, number>();
  for (const p of projektWorte) for (const x of p.worte) projektZaehler.set(x, (projektZaehler.get(x) ?? 0) + 1);
  const zuHaeufig = (x: string) => (projektZaehler.get(x) ?? 0) > 3;

  const funde: Fund[] = [];
  let i = 0;
  while (i < w.length) {
    const wort = w[i];
    if (STOPPWOERTER.has(wort) && !/^\d+$/.test(wort)) {
      i++;
      continue;
    }

    // 1. Fahrzeug: ganzer Name ("sprinter 1") oder Kennzeichen, sonst eindeutiges Einzelwort ("caddy")
    let fahrzeugFund: Fund | null = null;
    for (const f of fahrzeugWorte) {
      for (const folge of [f.name, f.kennzeichen]) {
        if (folge.length && folge.every((teil, k) => w[i + k] !== undefined && passt(w[i + k], teil))) {
          if (!fahrzeugFund || folge.length > fahrzeugFund.laenge) {
            fahrzeugFund = { art: "fahrzeug", id: f.id, laenge: folge.length };
          }
        }
      }
    }
    if (!fahrzeugFund) {
      const treffer = fahrzeugWorte.filter((f) => f.name.length > 0 && passt(wort, f.name[0]));
      if (treffer.length === 1 && !/^\d+$/.test(wort)) {
        fahrzeugFund = { art: "fahrzeug", id: treffer[0].id, laenge: 1 };
      } else if (treffer.length > 1) {
        hinweise.push(`„${wort}“ passt zu mehreren Autos – bitte mit Nummer sagen (z. B. „${wort} 1“).`);
        i++;
        continue;
      }
    }
    if (fahrzeugFund) {
      funde.push(fahrzeugFund);
      i += fahrzeugFund.laenge;
      continue;
    }

    // 2. Mitarbeiter: Vorname (ggf. + Nachname), sonst eindeutiger Nachname
    const perVorname = mitarbeiterWorte.filter((m) => m.vorname.length && passt(wort, m.vorname[0]));
    if (perVorname.length) {
      const naechstes = w[i + 1];
      const mitNachname = naechstes
        ? perVorname.filter((m) => m.nachname.length && passt(naechstes, m.nachname[0]))
        : [];
      if (mitNachname.length === 1) {
        funde.push({ art: "mitarbeiter", ids: [mitNachname[0].id], laenge: 2, wort });
        i += 2;
        continue;
      }
      funde.push({ art: "mitarbeiter", ids: perVorname.map((m) => m.id), laenge: 1, wort });
      i++;
      continue;
    }

    // 3. Baustelle über Stichworte (Kunde, Ort, Straße, Projektname)
    const projektTreffer = (x: string) =>
      zuHaeufig(x) ? [] : projektWorte.filter((p) => [...p.worte].some((pw) => passt(x, pw)));
    const kandidaten = projektTreffer(wort);
    if (kandidaten.length) {
      let auswahl = kandidaten;
      let laenge = 1;
      // Nächstes Wort kann die Auswahl eingrenzen ("Ringstrasse Friesoythe")
      if (auswahl.length > 1 && w[i + 1]) {
        const enger = projektTreffer(w[i + 1]).filter((p) => auswahl.includes(p));
        if (enger.length) {
          auswahl = enger;
          laenge = 2;
        }
      }
      if (auswahl.length === 1) {
        funde.push({ art: "projekt", id: auswahl[0].id, laenge });
        i += laenge;
        continue;
      }
      hinweise.push(`„${wort}“ passt zu mehreren Baustellen – bitte genauer sagen.`);
      i += laenge;
      continue;
    }

    // 4. Eindeutiger Nachname eines Mitarbeiters (nur wenn keine Baustelle passt)
    const perNachname = mitarbeiterWorte.filter((m) => m.nachname.length && passt(wort, m.nachname[0]));
    if (perNachname.length === 1) {
      funde.push({ art: "mitarbeiter", ids: [perNachname[0].id], laenge: 1, wort });
    }
    i++;
  }

  // Funde zu Gruppen zusammensetzen:
  // Eine neue Gruppe beginnt, wenn eine Art erneut auftaucht, die die aktuelle
  // Gruppe schon hat – außer bei direkt aufeinander folgenden Mitarbeitern.
  const gruppen: EinteilungsGruppe[] = [];
  let aktuell: EinteilungsGruppe | null = null;
  let letzteArt: Fund["art"] | null = null;

  const neueGruppe = () => {
    aktuell = { fahrzeugId: null, projektId: null, mitarbeiterIds: [] };
    gruppen.push(aktuell);
  };

  for (const fund of funde) {
    if (!aktuell) neueGruppe();
    const g = aktuell!;
    if (fund.art === "fahrzeug") {
      if (g.fahrzeugId) neueGruppe();
      aktuell!.fahrzeugId = fund.id;
    } else if (fund.art === "projekt") {
      if (g.projektId) neueGruppe();
      aktuell!.projektId = fund.id;
    } else {
      if (g.mitarbeiterIds.length && letzteArt !== "mitarbeiter") neueGruppe();
      if (fund.ids.length === 1) {
        if (!aktuell!.mitarbeiterIds.includes(fund.ids[0])) aktuell!.mitarbeiterIds.push(fund.ids[0]);
      } else {
        hinweise.push(`„${fund.wort}“ gibt es mehrmals – bitte mit Nachnamen sagen.`);
      }
    }
    letzteArt = fund.art;
  }

  const ergebnis = gruppen.filter(
    (g) => g.fahrzeugId || g.projektId || g.mitarbeiterIds.length,
  );
  if (!ergebnis.length && w.length) {
    hinweise.push("Ich habe keine Mitarbeiter, Autos oder Baustellen erkannt.");
  }
  return { gruppen: ergebnis, hinweise: [...new Set(hinweise)] };
}
