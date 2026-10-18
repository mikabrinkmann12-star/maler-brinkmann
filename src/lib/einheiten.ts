// Einheiten für Leistungen, Materialien und Positionen (Einstellungen → Kalkulation → Einheiten, wie in Plancraft).
// Die Liste dient als Vorschlag in den Eingabefeldern, die Felder selbst bleiben frei (jede Einheit bis 20 Zeichen ist möglich).
// Reine Logik, auch im Browser nutzbar. Gespeichert wird in app_settings (Schlüssel „einheiten“).

export type EinheitenEinstellungen = {
  liste: string[];
  /** Vorauswahl bei einer neuen Position im Angebot, in der Rechnung und bei einer neuen Leistung */
  position: string;
  /** Vorauswahl bei einem neuen Material */
  material: string;
};

export const MAX_EINHEITEN = 60;
export const MAX_EINHEIT_LAENGE = 20;

/** Plancraft-Liste (18.10.2026), so geschrieben wie in unserem Katalog (ohne Punkt am Ende). */
export const STANDARD_EINHEITEN: EinheitenEinstellungen = {
  liste: ["Dose", "Eimer", "kg", "km", "kWp", "Lfm", "Liter", "m", "m²", "m³", "Min", "ml", "Pkg", "psch", "Rolle", "Sack", "Std", "Stk", "Tube"],
  position: "Stk",
  material: "m²",
};

/** Eine Liste ohne leere und doppelte Einträge (Groß-/Kleinschreibung zählt als gleich), Reihenfolge bleibt. */
export function einheitenBereinigen(roh: readonly string[]): string[] {
  const gesehen = new Set<string>();
  const ergebnis: string[] = [];
  for (const e of roh) {
    const t = e.trim();
    if (!t) continue;
    const schluessel = t.toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    ergebnis.push(t);
  }
  return ergebnis;
}

/** Einstellungen aus dem gespeicherten JSON lesen; Kaputtes oder Fehlendes fällt auf die Standardwerte zurück. */
export function einheitenAusJson(wert: unknown): EinheitenEinstellungen {
  if (!wert || typeof wert !== "object") return STANDARD_EINHEITEN;
  const r = wert as Record<string, unknown>;
  const liste = Array.isArray(r.liste) ? einheitenBereinigen(r.liste.filter((e): e is string => typeof e === "string").map((e) => e.slice(0, MAX_EINHEIT_LAENGE))) : [];
  if (liste.length === 0) return STANDARD_EINHEITEN;
  const waehlen = (v: unknown, standard: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_EINHEIT_LAENGE) : standard);
  return { liste, position: waehlen(r.position, STANDARD_EINHEITEN.position), material: waehlen(r.material, STANDARD_EINHEITEN.material) };
}

/** Eingabe aus dem Formular prüfen. Fehler als deutscher Text, sonst die bereinigten Einstellungen. */
export function einheitenPruefen(eingabe: { liste: readonly string[]; position: string; material: string }): { fehler: string } | { wert: EinheitenEinstellungen } {
  const liste = einheitenBereinigen(eingabe.liste);
  if (liste.length === 0) return { fehler: "Es braucht mindestens eine Einheit." };
  if (liste.length > MAX_EINHEITEN) return { fehler: `Höchstens ${MAX_EINHEITEN} Einheiten.` };
  const zuLang = liste.find((e) => e.length > MAX_EINHEIT_LAENGE);
  if (zuLang) return { fehler: `Die Einheit „${zuLang}“ ist zu lang (höchstens ${MAX_EINHEIT_LAENGE} Zeichen).` };
  const finden = (name: string) => liste.find((e) => e.toLowerCase() === name.trim().toLowerCase());
  const position = finden(eingabe.position);
  const material = finden(eingabe.material);
  if (!position) return { fehler: "Die Vorauswahl für Positionen muss in der Liste stehen." };
  if (!material) return { fehler: "Die Vorauswahl für Material muss in der Liste stehen." };
  return { wert: { liste, position, material } };
}
