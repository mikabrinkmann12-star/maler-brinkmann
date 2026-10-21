// KI-System (Jarvis): aus dem Protokoll der Schnittstelle (api_log: Methode, Pfad, Status) lesbare Sätze machen. Reine Logik, getestet.
// Das Protokoll kennt nur Methode, Pfad und Status, keine Inhalte. Was genau eingetragen wurde, steht im jeweiligen Datensatz.

export type KiAktion = {
  /** Lesbarer Satz, z. B. „Container gemeldet“ */
  text: string;
  /** Verändert Daten (anlegen/ändern) oder nur abfragen */
  schreibend: boolean;
  ok: boolean;
};

const SCHREIB_TEXTE: { muster: RegExp; text: string }[] = [
  { muster: /^container$/, text: "Container gemeldet" },
  { muster: /^container\/[^/]+\/erledigt$/, text: "Container-Meldung als erledigt markiert" },
  { muster: /^zeiten$/, text: "Zeit eingetragen" },
  { muster: /^notizen$/, text: "Notiz angelegt" },
  { muster: /^kontakte$/, text: "Kontakt angelegt" },
  { muster: /^projekte$/, text: "Projekt angelegt" },
  { muster: /^angebote$/, text: "Angebot als Entwurf angelegt" },
  { muster: /^angebote\/[^/]+\/positionen$/, text: "Positionen zu einem Angebot hinzugefügt" },
  { muster: /^angebote\/[^/]+\/status$/, text: "Angebotsstatus gesetzt" },
  { muster: /^rechnungen$/, text: "Rechnungsentwurf angelegt" },
];

const BEREICHE: Record<string, string> = {
  uebersicht: "Übersicht", projekte: "Projekte", kontakte: "Kontakte", mitarbeiter: "Mitarbeiter", zeiten: "Zeiten", einteilung: "Einteilung",
  angebote: "Angebote", rechnungen: "Rechnungen", eingangsrechnungen: "Eingangsrechnungen", urlaub: "Urlaub", container: "Container",
  katalog: "Katalog", termine: "Termine",
};

export const istSchreibend = (methode: string) => ["POST", "PUT", "PATCH", "DELETE"].includes(methode.toUpperCase());

/** Aus einem Eintrag des Protokolls einen lesbaren Satz machen. Der Pfad darf mit oder ohne „/“ beginnen. */
export function aktionLesen(methode: string, pfad: string, status: number): KiAktion {
  const sauber = pfad.replace(/^\/+/, "").replace(/^api\/v1\/?/, "").replace(/\?.*$/, "").replace(/\/+$/, "");
  const ok = status >= 200 && status < 300;
  if (istSchreibend(methode)) {
    const treffer = SCHREIB_TEXTE.find((t) => t.muster.test(sauber));
    return { text: treffer?.text ?? `Änderung an „${sauber || "?"}“`, schreibend: true, ok };
  }
  const bereich = BEREICHE[sauber.split("/")[0]] ?? (sauber ? sauber.split("/")[0] : "Katalog der Schnittstelle");
  return { text: `Abgefragt: ${bereich}`, schreibend: false, ok };
}

/** Zählt die Abfragen (lesende Aufrufe) je Satz, absteigend. */
export function abfragenZaehlen(eintraege: readonly { methode: string; pfad: string; status: number }[]): { text: string; anzahl: number }[] {
  const zaehler = new Map<string, number>();
  for (const e of eintraege) {
    const a = aktionLesen(e.methode, e.pfad, e.status);
    if (a.schreibend) continue;
    zaehler.set(a.text, (zaehler.get(a.text) ?? 0) + 1);
  }
  return [...zaehler].map(([text, anzahl]) => ({ text, anzahl })).sort((x, y) => y.anzahl - x.anzahl || x.text.localeCompare(y.text, "de"));
}
