// Auswertung der Zeiten fürs Büro: Filter, Summen und CSV-Export für den Lohn.
// Reine Funktionen ohne Datenbankzugriff, damit sie sich gut testen lassen.

import { ZEIT_ARTEN, ZEIT_ART_NAMEN, uhrzeitKurz, type ZeitArt } from "@/lib/zeiten";

export type AuswertungEintrag = {
  id: string;
  userId: string;
  datum: string;
  von: string | null;
  bis: string | null;
  pauseMin: number;
  stunden: number;
  art: ZeitArt;
  projektId: string | null;
  projektName: string;
  projektNummer: string;
  beschreibung: string;
  /** Zeitpunkt und Person der letzten Änderung (nur in der Büro-Liste gefüllt) */
  bearbeitetAm?: string;
  bearbeitetVon?: string;
};

export type ZeitFilter = {
  personId: string;
  projektId: string;
  art: ZeitArt | "";
};

/** Filter aus der Adresse (?person=…&projekt=…&art=…) lesen. Unbekanntes wird ignoriert. */
export function filterLesen(roh: { person?: unknown; projekt?: unknown; art?: unknown }): ZeitFilter {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const text = (w: unknown) => (typeof w === "string" ? w : "");
  return {
    personId: uuid.test(text(roh.person)) ? text(roh.person) : "",
    projektId: uuid.test(text(roh.projekt)) ? text(roh.projekt) : "",
    art: (ZEIT_ARTEN as readonly string[]).includes(text(roh.art)) ? (text(roh.art) as ZeitArt) : "",
  };
}

export function eintraegeFiltern(eintraege: AuswertungEintrag[], f: ZeitFilter): AuswertungEintrag[] {
  return eintraege.filter(
    (e) =>
      (!f.personId || e.userId === f.personId) &&
      (!f.projektId || e.projektId === f.projektId) &&
      (!f.art || e.art === f.art),
  );
}

/** Nach Datum, dann Name, dann Beginn sortieren (stabil, ohne das Original zu ändern). */
export function eintraegeSortieren(eintraege: AuswertungEintrag[], namen: Map<string, string>): AuswertungEintrag[] {
  const name = (id: string) => namen.get(id) ?? "";
  return [...eintraege].sort(
    (a, b) =>
      a.datum.localeCompare(b.datum) ||
      name(a.userId).localeCompare(name(b.userId), "de") ||
      uhrzeitKurz(a.von).localeCompare(uhrzeitKurz(b.von)),
  );
}

// ---------------------------------------------------------------------------
// Summen
// ---------------------------------------------------------------------------
export type PersonSumme = {
  userId: string;
  name: string;
  jeArt: Partial<Record<ZeitArt, number>>;
  /** Summe aller Arten */
  gesamt: number;
};

/** Stunden mit 2 Nachkommastellen addieren, ohne Fließkomma-Reste (0,1 + 0,2). */
function addiere(a: number, b: number): number {
  return Math.round((a + b) * 100) / 100;
}

export function summenJePerson(eintraege: AuswertungEintrag[], namen: Map<string, string>): PersonSumme[] {
  const nachPerson = new Map<string, PersonSumme>();
  for (const e of eintraege) {
    const s = nachPerson.get(e.userId) ?? {
      userId: e.userId,
      name: namen.get(e.userId) ?? "Unbekannt",
      jeArt: {},
      gesamt: 0,
    };
    s.jeArt[e.art] = addiere(s.jeArt[e.art] ?? 0, e.stunden);
    s.gesamt = addiere(s.gesamt, e.stunden);
    nachPerson.set(e.userId, s);
  }
  return [...nachPerson.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Arten, die in den Daten vorkommen, in der festen Reihenfolge der App. */
export function vorkommendeArten(summen: PersonSumme[]): ZeitArt[] {
  return ZEIT_ARTEN.filter((art) => summen.some((s) => (s.jeArt[art] ?? 0) > 0));
}

export function gesamtSumme(summen: PersonSumme[]): PersonSumme {
  const gesamt: PersonSumme = { userId: "", name: "Gesamt", jeArt: {}, gesamt: 0 };
  for (const s of summen) {
    for (const art of ZEIT_ARTEN) {
      if (s.jeArt[art] != null) gesamt.jeArt[art] = addiere(gesamt.jeArt[art] ?? 0, s.jeArt[art]);
    }
    gesamt.gesamt = addiere(gesamt.gesamt, s.gesamt);
  }
  return gesamt;
}

// ---------------------------------------------------------------------------
// CSV (für Excel: Semikolon, deutsche Zahlen, UTF-8 mit BOM)
// ---------------------------------------------------------------------------

/**
 * Ein Textfeld für CSV. Felder, die mit = + - @ beginnen, würde Excel als Formel
 * ausführen (CSV-Injection über Beschreibungen) – ihnen wird ein ' vorangestellt.
 */
export function csvText(wert: string): string {
  const sicher = /^[=+\-@\t\r]/.test(wert) ? `'${wert}` : wert;
  return /[;"\r\n]/.test(sicher) ? `"${sicher.replace(/"/g, '""')}"` : sicher;
}

/** Stunden als „8,50“ (Dezimalkomma, immer 2 Stellen) – so rechnet Excel in Deutschland weiter. */
export function csvStunden(stunden: number): string {
  return stunden.toFixed(2).replace(".", ",");
}

/** „2026-10-16“ → „16.10.2026“ */
function csvDatum(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

/** Zeilen zu einem CSV-Text zusammensetzen (Windows-Zeilenenden, wie Excel sie erwartet). */
export function csvZusammensetzen(zeilen: string[][]): string {
  return zeilen.map((z) => z.join(";")).join("\r\n") + "\r\n";
}

/** Summen je Mitarbeiter und Art – die Übersicht für den Lohn. */
export function summenCsv(summen: PersonSumme[]): string {
  const arten = vorkommendeArten(summen);
  const kopf = ["Mitarbeiter", ...arten.map((a) => ZEIT_ART_NAMEN[a]), "Summe"];
  const zeilen = summen.map((s) => [
    csvText(s.name),
    ...arten.map((a) => csvStunden(s.jeArt[a] ?? 0)),
    csvStunden(s.gesamt),
  ]);
  const g = gesamtSumme(summen);
  return csvZusammensetzen([
    kopf.map(csvText),
    ...zeilen,
    ["Gesamt", ...arten.map((a) => csvStunden(g.jeArt[a] ?? 0)), csvStunden(g.gesamt)],
  ]);
}

/** Jeder einzelne Eintrag – für Rückfragen und eigene Auswertungen in Excel. */
export function einzelCsv(eintraege: AuswertungEintrag[], namen: Map<string, string>): string {
  const kopf = ["Datum", "Mitarbeiter", "Art", "Von", "Bis", "Pause (Min)", "Stunden", "Projektnummer", "Projekt", "Beschreibung"];
  const zeilen = eintraege.map((e) => [
    csvDatum(e.datum),
    csvText(namen.get(e.userId) ?? "Unbekannt"),
    csvText(ZEIT_ART_NAMEN[e.art]),
    uhrzeitKurz(e.von),
    uhrzeitKurz(e.bis),
    e.von ? String(e.pauseMin) : "",
    csvStunden(e.stunden),
    csvText(e.projektNummer),
    csvText(e.projektName),
    csvText(e.beschreibung),
  ]);
  return csvZusammensetzen([kopf.map(csvText), ...zeilen]);
}

// ---------------------------------------------------------------------------
// Zeiten-Seite im Stil von Plancraft: Mehrfachfilter, Kennzahlen, Tagessummen
// ---------------------------------------------------------------------------

/** Kleines Symbol je Zeitart in Listen und Filtern (wie die Symbole in Plancraft). */
export const ZEIT_ART_EMOJI: Record<ZeitArt, string> = {
  arbeitszeit: "🛠️",
  fahrtzeit: "🚗",
  bildung: "📚",
  schlechtwetter: "🌧️",
  sonstiges: "🟣",
  urlaub: "🌴",
  unbezahlter_urlaub: "🌵",
  krank: "🤒",
  kurzarbeit: "⏳",
  feiertag: "🎉",
  ueberstundenabbau: "😎",
};

export type ZeitenFilter = {
  personIds: string[];
  projektIds: string[];
  arten: ZeitArt[];
  q: string;
};

/** Mehrfachfilter plus Suche über Name, Projekt, Projektnummer und Beschreibung. Leere Listen filtern nicht. */
export function zeitenFiltern(eintraege: AuswertungEintrag[], f: ZeitenFilter, namen: Map<string, string>): AuswertungEintrag[] {
  const q = f.q.trim().toLowerCase();
  return eintraege.filter((e) => {
    if (f.personIds.length && !f.personIds.includes(e.userId)) return false;
    if (f.projektIds.length && !(e.projektId && f.projektIds.includes(e.projektId))) return false;
    if (f.arten.length && !f.arten.includes(e.art)) return false;
    if (!q) return true;
    return [namen.get(e.userId) ?? "", e.projektName, e.projektNummer, e.beschreibung, ZEIT_ART_NAMEN[e.art]].some((t) => t.toLowerCase().includes(q));
  });
}

export type Kennzahlen = {
  jeArt: Partial<Record<ZeitArt, { stunden: number; tage: number }>>;
  gesamtStunden: number;
  gesamtPause: number;
};

/** Stunden und Tage (je Person und Tag einmal gezählt) pro Zeitart, dazu Gesamtstunden und Gesamtpause in Stunden. */
export function kennzahlen(eintraege: AuswertungEintrag[]): Kennzahlen {
  const jeArt: Kennzahlen["jeArt"] = {};
  const tage = new Map<ZeitArt, Set<string>>();
  let gesamtStunden = 0;
  let pauseMin = 0;
  for (const e of eintraege) {
    const k = (jeArt[e.art] ??= { stunden: 0, tage: 0 });
    k.stunden = addiere(k.stunden, e.stunden);
    const set = tage.get(e.art) ?? new Set<string>();
    set.add(`${e.userId}|${e.datum}`);
    tage.set(e.art, set);
    k.tage = set.size;
    gesamtStunden = addiere(gesamtStunden, e.stunden);
    pauseMin += e.von ? e.pauseMin : 0;
  }
  return { jeArt, gesamtStunden, gesamtPause: Math.round((pauseMin / 60) * 100) / 100 };
}

export type TagesGruppe = { schluessel: string; eintraege: AuswertungEintrag[]; summe: { stunden: number; pauseMin: number } | null };

/**
 * Einträge nach Person und Tag gruppieren (Reihenfolge der Eingabe bleibt). Eine Summenzeile gibt es nur,
 * wenn jemand an einem Tag mehr als einen Eintrag hat (wie in Plancraft).
 */
export function nachTagGruppieren(eintraege: AuswertungEintrag[]): TagesGruppe[] {
  const gruppen: TagesGruppe[] = [];
  for (const e of eintraege) {
    const schluessel = `${e.datum}|${e.userId}`;
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.schluessel === schluessel) letzte.eintraege.push(e);
    else gruppen.push({ schluessel, eintraege: [e], summe: null });
  }
  for (const g of gruppen) {
    if (g.eintraege.length > 1) {
      g.summe = {
        stunden: g.eintraege.reduce((s, e) => addiere(s, e.stunden), 0),
        pauseMin: g.eintraege.reduce((s, e) => s + (e.von ? e.pauseMin : 0), 0),
      };
    }
  }
  return gruppen;
}

/** Pause als „0:45“ (Stunden:Minuten), 0 oder fehlend als „–“. */
export function pauseText(minuten: number | null | undefined): string {
  if (!minuten || minuten <= 0) return "–";
  return `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, "0")}`;
}
