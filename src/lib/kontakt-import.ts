// Kontakte aus dem Plancraft-Export (Google-Kontakte-Format als CSV) in unser Kontaktformat umwandeln.
// Reine Rechenlogik, läuft im Browser (Vorschau) und auf dem Server (Prüfung vor dem Speichern).

import { csvAlsObjekte } from "@/lib/csv";

export type KontaktEntwurf = {
  kundennummer: string | null;
  typ: "firma" | "privat";
  firmenname: string;
  anrede: string;
  vorname: string;
  nachname: string;
  strasse: string;
  plz: string;
  ort: string;
  ansprechpartner: string;
  telefon: string;
  mobil: string;
  email: string;
  website: string;
  notizen: string;
};

/** Diese Spalten müssen vorhanden sein, sonst ist es nicht der erwartete Export. */
export const ERWARTETE_SPALTEN = [
  "Name",
  "Given Name",
  "Family Name",
  "Organization 1 - Name",
  "Address 1 - Street",
  "Address 1 - City",
  "Address 1 - Postal Code",
  "Customer ID",
  "Type",
] as const;

const wert = (z: Record<string, string>, spalte: string) => (z[spalte] ?? "").trim();

/** Eine Zeile des Plancraft-Exports → Kontakt, oder ein Fehlertext. */
export function plancraftZuKontakt(z: Record<string, string>): KontaktEntwurf | { fehler: string } {
  const typ: KontaktEntwurf["typ"] = wert(z, "Type").toLowerCase().startsWith("org") ? "firma" : "privat";
  const firma = wert(z, "Organization 1 - Name");
  const gesamtName = wert(z, "Name");
  const gegeben = wert(z, "Given Name");
  const familie = wert(z, "Family Name");

  let vorname = "";
  let nachname = "";
  let ansprechpartner = "";
  let firmenname = "";
  if (typ === "firma") {
    firmenname = firma || gesamtName;
    ansprechpartner = [gegeben, familie].filter(Boolean).join(" ");
  } else {
    firmenname = "";
    if (familie) {
      vorname = gegeben;
      nachname = familie;
    } else {
      // „Familie Schröder“: nur ein Name, der gilt als Nachname
      nachname = gegeben || gesamtName;
    }
  }
  if (!firmenname && !nachname) return { fehler: "Weder Name noch Firma vorhanden." };

  // Telefon: Handy → „Mobil“, alles andere → „Telefon“, Überzähliges in die Notizen
  let telefon = "";
  let mobil = "";
  const weitere: string[] = [];
  for (const n of [1, 2, 3]) {
    const nummer = wert(z, `Phone ${n} - Value`);
    if (!nummer) continue;
    const handy = /mobile|cell|handy/i.test(wert(z, `Phone ${n} - Type`));
    if (handy && !mobil) mobil = nummer;
    else if (!handy && !telefon) telefon = nummer;
    else if (!telefon) telefon = nummer;
    else if (!mobil) mobil = nummer;
    else weitere.push(nummer);
  }

  // PLZ kann den Ort enthalten („26899 Esterwegen“)
  let plz = wert(z, "Address 1 - Postal Code");
  let ort = wert(z, "Address 1 - City");
  const plzOrt = /^(\d{4,5})\s+(.+)$/.exec(plz);
  if (plzOrt) {
    plz = plzOrt[1];
    if (!ort) ort = plzOrt[2];
  }

  const notizTeile = [
    wert(z, "Description"),
    wert(z, "Address 1 - Extended Address") && `Adresszusatz: ${wert(z, "Address 1 - Extended Address")}`,
    [wert(z, "E-mail 2 - Value"), wert(z, "E-mail 3 - Value")].filter(Boolean).length &&
      `Weitere E-Mail: ${[wert(z, "E-mail 2 - Value"), wert(z, "E-mail 3 - Value")].filter(Boolean).join(", ")}`,
    weitere.length && `Weitere Nummern: ${weitere.join(", ")}`,
  ].filter(Boolean);

  return {
    kundennummer: wert(z, "Customer ID") || null,
    typ,
    firmenname,
    anrede: wert(z, "Title"),
    vorname,
    nachname,
    strasse: wert(z, "Address 1 - Street"),
    plz,
    ort,
    ansprechpartner,
    telefon,
    mobil,
    email: wert(z, "E-mail 1 - Value"),
    website: wert(z, "Website 1 - Value"),
    notizen: notizTeile.join("\n"),
  };
}

export type ImportZeile = { zeile: number; entwurf?: KontaktEntwurf; fehler?: string };

/** Ganze CSV-Datei einlesen. `zeile` zählt wie in Excel (Kopfzeile = 1). */
export function kontakteAusCsv(text: string): { zeilen: ImportZeile[]; fehlendeSpalten: string[] } {
  const { spalten, zeilen } = csvAlsObjekte(text);
  const fehlendeSpalten = ERWARTETE_SPALTEN.filter((s) => !spalten.includes(s));
  if (fehlendeSpalten.length) return { zeilen: [], fehlendeSpalten };
  return {
    fehlendeSpalten: [],
    zeilen: zeilen.map((z, i) => {
      const r = plancraftZuKontakt(z);
      return "fehler" in r ? { zeile: i + 2, fehler: r.fehler } : { zeile: i + 2, entwurf: r };
    }),
  };
}

// ---------------------------------------------------------------------------
// Dubletten
// ---------------------------------------------------------------------------

function normal(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/str\./g, "strasse")
    .replace(/[^a-z0-9]/g, "");
}

/** Gleicher Name an gleicher Adresse = wahrscheinlich derselbe Kontakt. */
export function dublettenSchluessel(k: Pick<KontaktEntwurf, "firmenname" | "vorname" | "nachname" | "strasse" | "plz">): string {
  const name = k.firmenname || `${k.vorname} ${k.nachname}`;
  return `${normal(name)}|${normal(k.plz)}|${normal(k.strasse)}`;
}

export type ImportStatus = "neu" | "vorhanden" | "dublette" | "doppelt_in_datei" | "fehler";

export const STATUS_TEXT: Record<ImportStatus, string> = {
  neu: "Neu",
  vorhanden: "Kundennummer gibt es schon",
  dublette: "Name + Adresse gibt es schon",
  doppelt_in_datei: "Kommt in der Datei doppelt vor",
  fehler: "Fehler",
};

/**
 * Jeder Zeile einen Status geben. Importiert wird nur „neu“; nichts Bestehendes wird überschrieben.
 * bestehende: Kundennummern und Dubletten-Schlüssel der schon gespeicherten Kontakte.
 */
export function importStatus(
  zeilen: ImportZeile[],
  bestehende: { kundennummern: ReadonlySet<string>; schluessel: ReadonlySet<string> },
): ImportStatus[] {
  const gesehenNummern = new Set<string>();
  const gesehenSchluessel = new Set<string>();
  return zeilen.map((z) => {
    if (!z.entwurf) return "fehler";
    const nummer = z.entwurf.kundennummer;
    const schluessel = dublettenSchluessel(z.entwurf);
    if (nummer && bestehende.kundennummern.has(nummer)) return "vorhanden";
    if (bestehende.schluessel.has(schluessel)) return "dublette";
    if ((nummer && gesehenNummern.has(nummer)) || gesehenSchluessel.has(schluessel)) return "doppelt_in_datei";
    if (nummer) gesehenNummern.add(nummer);
    gesehenSchluessel.add(schluessel);
    return "neu";
  });
}
