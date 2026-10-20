// Berichte zu einem Projekt: Prüfung, Standardwerte und Hilfen für alle Berichtsarten (auch im Browser nutzbar).
// Aufbau jeder Art steht in `bericht-arten.ts`. Der art-spezifische Inhalt liegt als JSON in `project_reports.daten`:
//   { allgemein: { von, bis, wetter, temperatur, erstelltVon }, werte: { <Feld-Schlüssel>: Wert } }
import { z } from "zod";
import {
  BERICHT_ARTEN, BERICHT_ART_NAMEN, BERICHT_DEFS, KURZ_MAX, MAX_FOTOS, TEXT_MAX, istBerichtArt,
  type Abschnitt, type BerichtArt, type EinfachesFeld, type Feld,
} from "@/lib/bericht-arten";

export { BERICHT_ARTEN, BERICHT_ART_NAMEN, BERICHT_DEFS, MAX_FOTOS, istBerichtArt };
export type { BerichtArt };

export const WETTER = ["sonnig", "bewoelkt", "regen", "schnee", "wind", "frost"] as const;
export type Wetter = (typeof WETTER)[number];
export const WETTER_NAMEN: Record<Wetter, string> = {
  sonnig: "Sonnig",
  bewoelkt: "Bewölkt",
  regen: "Regen",
  schnee: "Schnee",
  wind: "Windig",
  frost: "Frost",
};

export type AllgemeinDaten = {
  von: string;
  bis: string;
  wetter: Wetter | null;
  temperatur: number | null;
  /** Nutzer-ID der Person „Erstellt von“ oder leer */
  erstelltVon: string;
};
export type EintragWerte = Record<string, string | number | null>;
export type FeldWert = string | number | null | string[] | EintragWerte[];
export type BerichtDaten = { allgemein: AllgemeinDaten; werte: Record<string, FeldWert> };

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (x: unknown) => (typeof x === "string" ? x : "");

/** Alle Felder eines Abschnitts, die etwas speichern (ohne festen Text). */
export function speicherFelder(abschnitt: Abschnitt): Exclude<Feld, { art: "festtext" }>[] {
  return abschnitt.felder.filter((f): f is Exclude<Feld, { art: "festtext" }> => f.art !== "festtext");
}

function leererWert(f: EinfachesFeld | Feld): FeldWert {
  switch (f.art) {
    case "text": return f.standard ?? "";
    case "zahl": return null;
    case "datum":
    case "auswahl":
    case "person": return "";
    case "checkliste":
    case "bilder": return [];
    case "liste": return [];
    case "festtext": return "";
  }
}

export function leereDaten(art: BerichtArt, ichId = ""): BerichtDaten {
  const werte: Record<string, FeldWert> = {};
  for (const a of BERICHT_DEFS[art].abschnitte) for (const f of speicherFelder(a)) werte[f.schluessel] = leererWert(f);
  return { allgemein: { von: "", bis: "", wetter: null, temperatur: null, erstelltVon: ichId }, werte };
}

// ---------------------------------------------------------------------------
// Prüfen (streng, beim Speichern) und Lesen (nachsichtig, beim Anzeigen)
// ---------------------------------------------------------------------------

function einfachPruefen(f: EinfachesFeld, roh: unknown): { wert: string | number | null } | { fehler: string } {
  switch (f.art) {
    case "text": {
      const t = str(roh).trim();
      const max = f.max ?? TEXT_MAX;
      if (t.length > max) return { fehler: `„${f.label}“ ist zu lang (höchstens ${max.toLocaleString("de-DE")} Zeichen).` };
      return { wert: t };
    }
    case "zahl": {
      if (roh === null || roh === undefined || roh === "") return { wert: null };
      if (typeof roh !== "number" || !Number.isFinite(roh) || roh < 0 || roh > 99999) return { fehler: `„${f.label}“: bitte eine Zahl von 0 bis 99.999 angeben.` };
      return { wert: Math.round(roh * 100) / 100 };
    }
    case "datum": {
      const t = str(roh);
      if (t !== "" && !ISO_TAG.test(t)) return { fehler: `„${f.label}“: bitte ein gültiges Datum angeben.` };
      return { wert: t };
    }
    case "auswahl": {
      const t = str(roh);
      if (t !== "" && !f.optionen.some((o) => o.wert === t)) return { fehler: `„${f.label}“: ungültige Auswahl.` };
      return { wert: t };
    }
    case "person": {
      const t = str(roh);
      if (t !== "" && !UUID.test(t)) return { fehler: `„${f.label}“: ungültige Person.` };
      return { wert: t };
    }
  }
}

function feldPruefen(f: Exclude<Feld, { art: "festtext" }>, roh: unknown): { wert: FeldWert } | { fehler: string } {
  if (f.art === "checkliste") {
    const liste = Array.isArray(roh) ? roh.filter((x): x is string => typeof x === "string") : [];
    return { wert: f.punkte.map((p) => p.wert).filter((w) => liste.includes(w)) };
  }
  if (f.art === "bilder") {
    const liste = Array.isArray(roh) ? roh : [];
    if (liste.length > MAX_FOTOS) return { fehler: `Höchstens ${MAX_FOTOS} Fotos pro Bericht.` };
    if (!liste.every((x) => typeof x === "string" && UUID.test(x))) return { fehler: "Ungültiges Foto." };
    return { wert: [...new Set(liste as string[])] };
  }
  if (f.art === "liste") {
    const liste = Array.isArray(roh) ? roh : [];
    if (liste.length > f.max) return { fehler: `„${f.label}“: höchstens ${f.max} Einträge.` };
    const eintraege: EintragWerte[] = [];
    for (const e of liste) {
      const objekt = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      const werte: EintragWerte = {};
      for (const ef of f.eintrag) {
        const r = einfachPruefen(ef, objekt[ef.schluessel]);
        if ("fehler" in r) return r;
        werte[ef.schluessel] = r.wert;
      }
      // ganz leere Einträge fallen weg
      if (Object.values(werte).some((w) => w !== "" && w !== null)) eintraege.push(werte);
    }
    return { wert: eintraege };
  }
  return einfachPruefen(f, roh);
}

function allgemeinPruefen(art: BerichtArt, roh: unknown): { allgemein: AllgemeinDaten } | { fehler: string } {
  const o = (roh && typeof roh === "object" ? roh : {}) as Record<string, unknown>;
  const def = BERICHT_DEFS[art].allgemein;
  const von = str(o.von), bis = str(o.bis);
  for (const t of [von, bis]) if (t !== "" && !ISO_TAG.test(t)) return { fehler: "Bitte ein gültiges Datum im Leistungszeitraum angeben." };
  if (def.zeitraum && von && bis && bis < von) return { fehler: "Das Ende des Leistungszeitraums liegt vor dem Beginn." };
  const wetter = o.wetter === null || o.wetter === undefined || o.wetter === "" ? null : o.wetter;
  if (wetter !== null && !(WETTER as readonly unknown[]).includes(wetter)) return { fehler: "Ungültiges Wetter." };
  const temperatur = o.temperatur === null || o.temperatur === undefined || o.temperatur === "" ? null : o.temperatur;
  if (temperatur !== null && (typeof temperatur !== "number" || !Number.isInteger(temperatur) || temperatur < -40 || temperatur > 50)) {
    return { fehler: "Die Temperatur muss eine ganze Zahl zwischen -40 und 50 sein." };
  }
  const person = str(o.erstelltVon);
  if (person !== "" && !UUID.test(person)) return { fehler: "Ungültige Person bei „Erstellt von“." };
  return {
    allgemein: {
      von: def.zeitraum ? von : "",
      bis: def.zeitraum ? bis : "",
      wetter: def.wetter ? (wetter as Wetter | null) : null,
      temperatur: def.wetter ? (temperatur as number | null) : null,
      erstelltVon: def.erstelltVon ? person : "",
    },
  };
}

/** Eingabe des Formulars prüfen und bereinigen (unbekannte Felder fallen weg). */
export function datenPruefen(art: BerichtArt, roh: unknown): { daten: BerichtDaten } | { fehler: string } {
  const o = (roh && typeof roh === "object" ? roh : {}) as { allgemein?: unknown; werte?: unknown };
  const quelle = (o.werte && typeof o.werte === "object" ? o.werte : {}) as Record<string, unknown>;
  const allgemein = allgemeinPruefen(art, o.allgemein);
  if ("fehler" in allgemein) return allgemein;
  const werte: Record<string, FeldWert> = {};
  for (const a of BERICHT_DEFS[art].abschnitte) {
    for (const f of speicherFelder(a)) {
      const r = feldPruefen(f, quelle[f.schluessel]);
      if ("fehler" in r) return r;
      werte[f.schluessel] = r.wert;
    }
  }
  return { daten: { allgemein: allgemein.allgemein, werte } };
}

/** Frühere Bautagesberichte hatten andere Felder (arbeiten, personal …): in die neue Form übernehmen. */
function altesFormat(art: BerichtArt, roh: Record<string, unknown>): Record<string, unknown> | null {
  if (art !== "bautagesbericht" || !("arbeiten" in roh || "personal" in roh || "besonderheiten" in roh)) return null;
  const personal = Array.isArray(roh.personal) ? roh.personal.filter((x): x is string => typeof x === "string") : [];
  return {
    allgemein: { wetter: roh.wetter ?? null, temperatur: roh.temperatur ?? null },
    werte: {
      mitarbeiter: personal.map((person) => ({ person, bereich: "", anzahl: null, stunden: null })),
      leistungen: roh.arbeiten ?? "",
      vorkommnisse: roh.besonderheiten ?? "",
      bilder: roh.fotos ?? [],
    },
  };
}

/** Gespeicherte Daten (JSON aus der Datenbank) sicher lesen: Kaputtes wird zum Leerwert, der Rest bleibt lesbar. */
export function datenLesen(art: BerichtArt, roh: unknown): BerichtDaten {
  const objekt = (roh && typeof roh === "object" && !Array.isArray(roh) ? roh : {}) as Record<string, unknown>;
  const quelle = altesFormat(art, objekt) ?? objekt;
  const standard = leereDaten(art);
  const q = quelle as { allgemein?: Record<string, unknown>; werte?: Record<string, unknown> };
  const vorAllgemein = allgemeinPruefen(art, q.allgemein);
  const allgemein = "allgemein" in vorAllgemein ? vorAllgemein.allgemein : standard.allgemein;
  const werte: Record<string, FeldWert> = {};
  for (const a of BERICHT_DEFS[art].abschnitte) {
    for (const f of speicherFelder(a)) {
      const r = feldPruefen(f, q.werte?.[f.schluessel]);
      werte[f.schluessel] = "wert" in r ? r.wert : standard.werte[f.schluessel];
    }
  }
  return { allgemein, werte };
}

/** Personen und Fotos, auf die der Bericht verweist (der Server prüft, dass sie zulässig sind). */
export function verweise(art: BerichtArt, daten: BerichtDaten): { personen: string[]; fotos: string[] } {
  const personen = new Set<string>();
  const fotos = new Set<string>();
  if (daten.allgemein.erstelltVon) personen.add(daten.allgemein.erstelltVon);
  for (const a of BERICHT_DEFS[art].abschnitte) {
    for (const f of speicherFelder(a)) {
      const w = daten.werte[f.schluessel];
      if (f.art === "person" && typeof w === "string" && w) personen.add(w);
      if (f.art === "bilder" && Array.isArray(w)) for (const id of w as string[]) fotos.add(id);
      if (f.art === "liste" && Array.isArray(w)) {
        for (const e of w as EintragWerte[]) for (const ef of f.eintrag) if (ef.art === "person" && typeof e[ef.schluessel] === "string" && e[ef.schluessel]) personen.add(e[ef.schluessel] as string);
      }
    }
  }
  return { personen: [...personen], fotos: [...fotos] };
}

/** Ist im Abschnitt schon etwas ausgefüllt? (Häkchen in der Abschnittsliste) */
export function abschnittAusgefuellt(art: BerichtArt, abschnitt: Abschnitt, daten: BerichtDaten): boolean {
  if (abschnitt.id === "allgemein") return true; // ist vorbelegt
  return speicherFelder(abschnitt).some((f) => {
    const w = daten.werte[f.schluessel];
    if (f.art === "text" && f.standard !== undefined) return true; // vorbelegter Text zählt als erledigt
    if (Array.isArray(w)) return w.length > 0;
    return w !== "" && w !== null && w !== undefined;
  });
}

// ---------------------------------------------------------------------------
// Speichern und Abschließen (Server-Aktionen)
// ---------------------------------------------------------------------------

/** Bericht speichern (Entwurf anlegen oder ändern). Die ID erzeugt die App, mehrfaches Senden ist unschädlich. */
export const berichtSpeichernSchema = z.object({
  id: z.uuid(),
  projektId: z.uuid(),
  art: z.enum(BERICHT_ARTEN),
  datum: z.string().regex(ISO_TAG, "Bitte ein Datum angeben."),
  daten: z.unknown(),
});

/** Bericht abschließen: optional mit Unterschrift des Kunden (Name + Bild, das schon im Speicher liegt). */
export const berichtAbschliessenSchema = z.object({
  id: z.uuid(),
  projektId: z.uuid(),
  unterschrift: z
    .object({ name: z.string().trim().min(1, "Bitte den Namen des Unterschreibenden angeben.").max(100, "Der Name ist zu lang (höchstens 100 Zeichen).") })
    .nullable()
    .default(null),
});

/** Speicherpfad der Unterschrift: <Projekt>/<Bericht-ID>.png */
export function unterschriftPfad(projektId: string, berichtId: string): string {
  return `${projektId}/${berichtId}.png`;
}

/** Kurzer Text für die Berichtsliste: „Sonnig, 14 °C“ */
export function wetterText(wetter: Wetter | null, temperatur: number | null): string {
  const teile = [wetter ? WETTER_NAMEN[wetter] : "", temperatur !== null ? `${temperatur} °C` : ""].filter(Boolean);
  return teile.join(", ");
}

/** Unterschrift aus der Zeichenfläche: ist überhaupt etwas gezeichnet? (Anteil nicht-transparenter Bildpunkte) */
export function istGezeichnet(alpha: ArrayLike<number>, mindestAnteil = 0.002): boolean {
  if (alpha.length === 0) return false;
  let belegt = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > 0) belegt++;
  return belegt / alpha.length >= mindestAnteil;
}

/** Zahl für die Anzeige: 8 → „8“, 7,5 → „7,5“. */
export function zahlText(wert: number | null | undefined): string {
  return wert === null || wert === undefined ? "" : wert.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

/** Kürzel zum Lesen eines Listen-Eintrags (z. B. für PDF und Ansicht): „Max Muster · Facharbeiter · 8 h“ */
export function eintragsZeile(
  f: Extract<Feld, { art: "liste" }>,
  e: EintragWerte,
  personName: (id: string) => string,
  datumText: (iso: string) => string,
): { titel: string; zusatz: string[] } {
  const teile: { feld: EinfachesFeld; text: string }[] = [];
  for (const ef of f.eintrag) {
    const w = e[ef.schluessel];
    if (w === "" || w === null || w === undefined) continue;
    let text = "";
    if (ef.art === "person") text = personName(String(w));
    else if (ef.art === "auswahl") text = ef.optionen.find((o) => o.wert === w)?.name ?? String(w);
    else if (ef.art === "datum") text = datumText(String(w));
    else if (ef.art === "zahl") text = `${zahlText(Number(w))}${ef.einheit ? ` ${ef.einheit}` : ""}`;
    else text = String(w);
    teile.push({ feld: ef, text });
  }
  const [erster, ...rest] = teile;
  // Kurze Angaben (Zahl, Auswahl, Datum …) in eine Zeile, Freitexte darunter jeweils mit Beschriftung
  const kurz = rest.filter((t) => t.feld.art !== "text").map((t) => (t.feld.art === "datum" || (t.feld.art === "zahl" && !t.feld.einheit) ? `${t.feld.label}: ${t.text}` : t.text));
  const langtexte = rest.filter((t) => t.feld.art === "text").map((t) => `${t.feld.label}: ${t.text}`);
  return { titel: erster?.text ?? "–", zusatz: [...(kurz.length ? [kurz.join(" · ")] : []), ...langtexte] };
}

export { KURZ_MAX, TEXT_MAX };
