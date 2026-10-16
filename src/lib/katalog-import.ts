// CSV-Import für Materialien (auch im Browser nutzbar): Datei lesen, Zeilen prüfen,
// Dubletten erkennen. Nichts Bestehendes wird überschrieben.
//
// Erwartete Spalten (Kopfzeile, Groß-/Kleinschreibung egal, Reihenfolge egal):
//   Bezeichnung*, Einheit*, Einkaufspreis*     Pflicht
//   Ordner            Pfad mit „>“, z. B. „Farben > Dispersion“ (fehlt = ohne Ordner)
//   Artikelnummer, Lieferant, Beschreibung
//   Zuschlag          Prozent; fehlt er, wird er aus „Verkaufspreis“ berechnet, sonst 0

import { csvAlsObjekte } from "@/lib/csv";
import { MAX_ZUSCHLAG, preisLesen, vkBerechnen } from "@/lib/katalog";
import { materialSchema } from "@/lib/katalog-schema";
import { ersteMeldung } from "@/lib/nutzer-schema";

export type MaterialEntwurf = {
  /** Ordner von oben nach unten; leer = ohne Ordner */
  ordner: string[];
  artikelnr: string;
  name: string;
  lieferant: string;
  einheit: string;
  ek: number;
  zuschlag: number;
  beschreibung: string;
};

export type ImportZeile = {
  /** Zeilennummer in der Datei (Kopfzeile = 1) */
  zeile: number;
  entwurf?: MaterialEntwurf;
  fehler?: string;
  /** Hinweis, der den Import nicht verhindert (z. B. „Zuschlag aus Verkaufspreis berechnet“) */
  hinweis?: string;
};

export const MAX_ORDNER_TIEFE = 6;
export const MAX_ZEILEN_PRO_DATEI = 5000;

/** Spaltenname (kleingeschrieben, ohne Sonderzeichen) → Feld */
const SPALTEN: Record<string, "ordner" | "artikelnr" | "name" | "lieferant" | "einheit" | "ek" | "zuschlag" | "vk" | "beschreibung"> = {
  ordner: "ordner", ordnerpfad: "ordner", warengruppe: "ordner", kategorie: "ordner",
  artikelnummer: "artikelnr", artikelnr: "artikelnr", artnr: "artikelnr", nummer: "artikelnr",
  bezeichnung: "name", name: "name", artikel: "name", kurztext: "name",
  lieferant: "lieferant", hersteller: "lieferant",
  einheit: "einheit", me: "einheit", mengeneinheit: "einheit",
  einkaufspreis: "ek", ek: "ek", einkauf: "ek", einkaufspreiseuro: "ek",
  zuschlag: "zuschlag", aufschlag: "zuschlag", zuschlagprozent: "zuschlag",
  verkaufspreis: "vk", vk: "vk", verkauf: "vk",
  beschreibung: "beschreibung", langtext: "beschreibung",
};

export const PFLICHT_SPALTEN = ["Bezeichnung", "Einheit", "Einkaufspreis"] as const;

function spaltenName(roh: string): string {
  return roh.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, "");
}

/** Ordnerpfad „Farben > Dispersion“ (auch „/“ oder „›“) in Namen zerlegen. */
export function ordnerPfadLesen(text: string): string[] {
  return text.split(/\s*[>›/]\s*/).map((t) => t.trim()).filter(Boolean);
}

export function materialienAusCsv(text: string): { zeilen: ImportZeile[]; fehlendeSpalten: string[]; zuViele: boolean } {
  const { spalten, zeilen } = csvAlsObjekte(text);
  const zuordnung = new Map<string, string>(); // Feld → Spaltenname in der Datei
  for (const s of spalten) {
    const feld = SPALTEN[spaltenName(s)];
    if (feld && !zuordnung.has(feld)) zuordnung.set(feld, s);
  }
  const fehlend = [
    !zuordnung.has("name") && "Bezeichnung",
    !zuordnung.has("einheit") && "Einheit",
    !zuordnung.has("ek") && "Einkaufspreis",
  ].filter((s): s is string => Boolean(s));
  if (fehlend.length) return { zeilen: [], fehlendeSpalten: fehlend, zuViele: false };
  if (zeilen.length > MAX_ZEILEN_PRO_DATEI) return { zeilen: [], fehlendeSpalten: [], zuViele: true };

  const wert = (z: Record<string, string>, feld: string) => (zuordnung.has(feld) ? z[zuordnung.get(feld)!] ?? "" : "");

  return {
    fehlendeSpalten: [],
    zuViele: false,
    zeilen: zeilen.map((z, i) => {
      const nummer = i + 2;
      const ordner = ordnerPfadLesen(wert(z, "ordner"));
      if (ordner.length > MAX_ORDNER_TIEFE) return { zeile: nummer, fehler: `Der Ordnerpfad ist zu tief (höchstens ${MAX_ORDNER_TIEFE} Ebenen).` };
      if (ordner.some((o) => o.length > 100)) return { zeile: nummer, fehler: "Ein Ordnername ist zu lang (höchstens 100 Zeichen)." };

      let zuschlagText = wert(z, "zuschlag");
      let hinweis: string | undefined;
      // Fehlt der Zuschlag, aber es gibt Einkaufs- und Verkaufspreis: Zuschlag daraus berechnen
      if (zuschlagText.trim() === "" && wert(z, "vk").trim() !== "") {
        const ek = preisLesen(wert(z, "ek").trim() || "0");
        const vk = preisLesen(wert(z, "vk"));
        if (ek != null && vk != null && ek > 0) {
          const prozent = Math.round((vk / ek - 1) * 10_000) / 100;
          if (prozent >= 0 && prozent <= MAX_ZUSCHLAG) {
            zuschlagText = String(prozent).replace(".", ",");
            if (vkBerechnen(ek, prozent) !== vk) hinweis = "Zuschlag aus dem Verkaufspreis berechnet, der Verkaufspreis weicht um Cent ab.";
            else hinweis = "Zuschlag aus dem Verkaufspreis berechnet.";
          }
        }
      }

      const r = materialSchema.safeParse({
        folderId: "",
        artikelnr: wert(z, "artikelnr"),
        name: wert(z, "name"),
        beschreibung: wert(z, "beschreibung"),
        lieferant: wert(z, "lieferant"),
        einheit: wert(z, "einheit"),
        ek: wert(z, "ek"),
        zuschlag: zuschlagText,
      });
      if (!r.success) return { zeile: nummer, fehler: ersteMeldung(r.error) };
      const m = r.data;
      return {
        zeile: nummer,
        hinweis,
        entwurf: { ordner, artikelnr: m.artikelnr, name: m.name, lieferant: m.lieferant, einheit: m.einheit, ek: m.ek, zuschlag: m.zuschlag, beschreibung: m.beschreibung },
      };
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
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Wann ist ein Material „schon da“? Mit Artikelnummer: gleiche Nummer beim gleichen Lieferanten.
 * Ohne Artikelnummer: gleicher Name, gleiche Einheit im gleichen Ordner.
 */
export function materialSchluessel(m: { artikelnr: string; lieferant: string; name: string; einheit: string; ordnerPfad: string }): string {
  return m.artikelnr.trim()
    ? `nr|${normal(m.lieferant)}|${normal(m.artikelnr)}`
    : `name|${normal(m.ordnerPfad)}|${normal(m.name)}|${normal(m.einheit)}`;
}

export function entwurfSchluessel(e: MaterialEntwurf): string {
  return materialSchluessel({ ...e, ordnerPfad: e.ordner.join(" > ") });
}

export type ImportStatus = "neu" | "vorhanden" | "doppelt_in_datei" | "fehler";

export const STATUS_TEXT: Record<ImportStatus, string> = {
  neu: "Neu",
  vorhanden: "Gibt es schon",
  doppelt_in_datei: "Kommt in der Datei doppelt vor",
  fehler: "Fehler",
};

/** Jeder Zeile einen Status geben. Importiert wird nur „neu“; nichts Bestehendes wird überschrieben. */
export function importStatus(zeilen: ImportZeile[], bestehendeSchluessel: ReadonlySet<string>): ImportStatus[] {
  const gesehen = new Set<string>();
  return zeilen.map((z) => {
    if (!z.entwurf) return "fehler";
    const schluessel = entwurfSchluessel(z.entwurf);
    if (bestehendeSchluessel.has(schluessel)) return "vorhanden";
    if (gesehen.has(schluessel)) return "doppelt_in_datei";
    gesehen.add(schluessel);
    return "neu";
  });
}

// ---------------------------------------------------------------------------
// Vorlage zum Herunterladen
// ---------------------------------------------------------------------------
export const VORLAGE_CSV =
  "Ordner;Artikelnummer;Bezeichnung;Lieferant;Einheit;Einkaufspreis;Zuschlag;Beschreibung\r\n" +
  "Farben > Dispersion;DF-125;Dispersionsfarbe weiß 12,5 l;Wilts;Eimer;19,99;30;Innen, matt\r\n" +
  "Zubehör;;Malerkrepp 50 m;;Rolle;2,49;40;\r\n";
