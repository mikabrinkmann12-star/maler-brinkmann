// KI-Schnittstelle (Platzhalter). Die KI ist noch NICHT angeschlossen, es wird nichts an einen Dienst geschickt.
//
// Entscheidung (Mika, 18.10.2026): Die KI soll in der App sichtbar sein, aber noch nicht funktionieren,
// damit man Ralf zeigen kann, dass es sie geben wird. Echte KI kostet pro Nutzung Geld und kommt erst nach Ralfs Entscheidung.
// Später ersetzt ein echter Anbieter `kiAnbieter()`; alles Übrige (Oberfläche, Aktion) bleibt gleich.
// Regeln für später: Die KI macht nur VORSCHLÄGE, das Büro prüft und speichert; Mitarbeiter-/Kundendaten nur an Anbieter mit
// Auftragsverarbeitungsvertrag und ohne Training mit den Daten.

export type KiPosition = { kurztext: string; langtext: string; menge: number; einheit: string };

export type KiVorschlag = {
  positionen: KiPosition[];
  hinweis?: string;
};

export type KiErgebnis =
  | { aktiv: false; meldung: string }
  | { aktiv: true; vorschlag: KiVorschlag };

export interface KiAnbieter {
  /** Name für die Anzeige */
  name: string;
  /** Ist eine echte KI angeschlossen? */
  aktiv: boolean;
  /** Aus einer freien Beschreibung („Wohnzimmer 25 m² streichen, Decke weiß …“) Positionen vorschlagen. */
  angebotVorschlagen(beschreibung: string): Promise<KiErgebnis>;
}

export const MAX_KI_BESCHREIBUNG = 2000;

export const KI_NICHT_AKTIV_TEXT =
  "Der KI-Assistent ist noch nicht angeschlossen. Später macht er aus deiner Beschreibung Vorschläge für Positionen, die du prüfst und übernimmst. Bis dahin wird nichts an einen Dienst geschickt.";

const platzhalter: KiAnbieter = {
  name: "KI-Assistent (Vorschau)",
  aktiv: false,
  async angebotVorschlagen() {
    return { aktiv: false, meldung: KI_NICHT_AKTIV_TEXT };
  },
};

/** Der aktuell angeschlossene Anbieter. Heute immer der Platzhalter. */
export function kiAnbieter(): KiAnbieter {
  return platzhalter;
}
