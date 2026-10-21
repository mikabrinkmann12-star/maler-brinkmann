// Dokumentarten des Dokument-Editors (Mika, 21.10.2026, wie „Neues Dokument“ in Plancraft). Alle teilen Editor, PDF und Liste der Angebote
// (Tabelle `quotes`). Was sich unterscheidet: ob Preise und Summen gezeigt werden, ob es eine Positionstabelle gibt und ob unten ein
// Annahme-Block zum Unterschreiben steht. Rechnung und Gutschrift gehören der Buchhaltung (Lexware) und sind hier nicht dabei.

export const DOKUMENTARTEN = ["angebot", "kostenvoranschlag", "auftragsbestaetigung", "lieferschein", "bestellschein", "brief"] as const;
export type Dokumentart = (typeof DOKUMENTARTEN)[number];

export type DokumentartInfo = {
  name: string;
  /** Mit Preisen und Summen (Lieferschein: ohne) */
  preise: boolean;
  /** Mit Positionstabelle (Brief: nur Text) */
  positionen: boolean;
  /** Satz über dem Unterschriftsfeld des Kunden, leer = kein Annahme-Block */
  zustimmung: string;
  /** Satz mit Gültigkeitsdatum („{datum}“ wird ersetzt), leer = keiner */
  gueltig: string;
  /** Hinweis in der Oberfläche */
  hinweis: string;
  /** Eigener Anfangstext für neue Dokumente; null = der Text aus „Angebote – Vorgaben“ bzw. der Standard-Vorlage */
  einleitung: string | null;
  /** Neue Dokumente dieser Art bekommen den Schlusstext der Vorgaben (sonst bleibt er leer, weil er vom Angebot handelt) */
  schlusstext: boolean;
};

export const DOKUMENTART_INFO: Record<Dokumentart, DokumentartInfo> = {
  angebot: { name: "Angebot", preise: true, positionen: true, zustimmung: "Mit dem Angebot bin ich einverstanden.", gueltig: "Dieses Angebot ist gültig bis {datum}.", hinweis: "Preise an den Kunden.", einleitung: null, schlusstext: true },
  kostenvoranschlag: { name: "Kostenvoranschlag", preise: true, positionen: true, zustimmung: "Mit dem Kostenvoranschlag bin ich einverstanden.", gueltig: "Dieser Kostenvoranschlag ist gültig bis {datum}.", hinweis: "Unverbindliche Kostenschätzung.", einleitung: null, schlusstext: true },
  auftragsbestaetigung: { name: "Auftragsbestätigung", preise: true, positionen: true, zustimmung: "", gueltig: "", hinweis: "Bestätigt dem Kunden den erteilten Auftrag.", einleitung: "Sehr geehrte Damen und Herren,\nvielen Dank für Ihren Auftrag. Wir bestätigen Ihnen diesen wie folgt:", schlusstext: false },
  lieferschein: { name: "Lieferschein", preise: false, positionen: true, zustimmung: "", gueltig: "", hinweis: "Ohne Preise und Summen.", einleitung: "Sehr geehrte Damen und Herren,\nwir liefern bzw. führen für Sie wie folgt aus:", schlusstext: false },
  bestellschein: { name: "Bestellschein", preise: true, positionen: true, zustimmung: "", gueltig: "", hinweis: "Bestellung bei einem Lieferanten.", einleitung: "Sehr geehrte Damen und Herren,\nwir bestellen bei Ihnen wie folgt:", schlusstext: false },
  brief: { name: "Brief", preise: false, positionen: false, zustimmung: "", gueltig: "", hinweis: "Nur Text, ohne Positionen und Summen.", einleitung: "Sehr geehrte Damen und Herren,", schlusstext: false },
};

export function istDokumentart(wert: unknown): wert is Dokumentart {
  return typeof wert === "string" && (DOKUMENTARTEN as readonly string[]).includes(wert);
}

/** Info zur Art; unbekannt (z. B. alte Daten) = Angebot. */
export function dokumentartInfo(art: unknown): DokumentartInfo {
  return istDokumentart(art) ? DOKUMENTART_INFO[art] : DOKUMENTART_INFO.angebot;
}

/** Titel auf dem PDF und in der Oberfläche: „Angebot“, „Nachtrag - Auftragsbestätigung“; im Entwurf mit „ - Entwurf“. */
export function dokumentTitel(art: unknown, nachtrag: boolean, entwurf: boolean): string {
  const name = dokumentartInfo(art).name;
  return `${nachtrag ? "Nachtrag - " : ""}${name}${entwurf ? " - Entwurf" : ""}`;
}

/** Aus einem Dokument darf eine Rechnung entstehen (nur Angebot, Kostenvoranschlag, Auftragsbestätigung). */
export function rechnungMoeglich(art: unknown): boolean {
  return art === "angebot" || art === "kostenvoranschlag" || art === "auftragsbestaetigung";
}
