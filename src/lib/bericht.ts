// Berichte zu einem Projekt: Prüfung und Hilfen für den Bautagesbericht (auch im Browser nutzbar).
// Der art-spezifische Inhalt steht als JSON in `project_reports.daten`, hier prüft ihn zod.
import { z } from "zod";

export const BERICHT_ARTEN = ["bautagesbericht"] as const;
export type BerichtArt = (typeof BERICHT_ARTEN)[number];
export const BERICHT_ART_NAMEN: Record<BerichtArt, string> = { bautagesbericht: "Bautagesbericht" };

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

export const MAX_FOTOS = 8;
export const MAX_PERSONAL = 30;
export const ARBEITEN_MAX = 4000;
export const BESONDERHEITEN_MAX = 2000;

export const bautagesberichtDaten = z.object({
  wetter: z.enum(WETTER).nullable().default(null),
  temperatur: z.number().int("Bitte eine ganze Gradzahl angeben.").min(-40, "Die Temperatur ist zu niedrig.").max(50, "Die Temperatur ist zu hoch.").nullable().default(null),
  personal: z.array(z.uuid()).max(MAX_PERSONAL).default([]),
  arbeiten: z.string().trim().max(ARBEITEN_MAX, `Die ausgeführten Arbeiten sind zu lang (höchstens ${ARBEITEN_MAX.toLocaleString("de-DE")} Zeichen).`).default(""),
  besonderheiten: z.string().trim().max(BESONDERHEITEN_MAX, `Die Besonderheiten sind zu lang (höchstens ${BESONDERHEITEN_MAX.toLocaleString("de-DE")} Zeichen).`).default(""),
  fotos: z.array(z.uuid()).max(MAX_FOTOS, `Höchstens ${MAX_FOTOS} Fotos pro Bericht.`).default([]),
});
export type BautagesberichtDaten = z.infer<typeof bautagesberichtDaten>;

export const LEERER_BAUTAGESBERICHT: BautagesberichtDaten = {
  wetter: null, temperatur: null, personal: [], arbeiten: "", besonderheiten: "", fotos: [],
};

const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

/** Bericht speichern (Entwurf anlegen oder ändern). Die ID erzeugt die App, mehrfaches Senden ist unschädlich. */
export const berichtSpeichernSchema = z.object({
  id: z.uuid(),
  projektId: z.uuid(),
  art: z.enum(BERICHT_ARTEN),
  datum: z.string().regex(ISO_TAG, "Bitte ein Datum angeben."),
  daten: bautagesberichtDaten,
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

/** Gespeicherte Daten (JSON aus der Datenbank) sicher lesen: fehlende oder kaputte Felder werden zu Leerwerten. */
export function datenLesen(roh: unknown): BautagesberichtDaten {
  const r = bautagesberichtDaten.safeParse(roh ?? {});
  if (r.success) return r.data;
  // Einzelne kaputte Felder nicht den ganzen Bericht unlesbar machen lassen
  const o = (roh && typeof roh === "object" ? roh : {}) as Record<string, unknown>;
  const feld = <K extends keyof BautagesberichtDaten>(k: K): BautagesberichtDaten[K] => {
    const einzel = bautagesberichtDaten.shape[k].safeParse(o[k]);
    return einzel.success ? (einzel.data as BautagesberichtDaten[K]) : LEERER_BAUTAGESBERICHT[k];
  };
  return { wetter: feld("wetter"), temperatur: feld("temperatur"), personal: feld("personal"), arbeiten: feld("arbeiten"), besonderheiten: feld("besonderheiten"), fotos: feld("fotos") };
}

/** Unterschrift aus der Zeichenfläche: ist überhaupt etwas gezeichnet? (Anteil nicht-transparenter Bildpunkte) */
export function istGezeichnet(alpha: ArrayLike<number>, mindestAnteil = 0.002): boolean {
  if (alpha.length === 0) return false;
  let belegt = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > 0) belegt++;
  return belegt / alpha.length >= mindestAnteil;
}
