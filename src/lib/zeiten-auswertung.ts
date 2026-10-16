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
