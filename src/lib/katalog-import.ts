// CSV-Import für Materialien und Leistungen (auch im Browser nutzbar): Datei lesen,
// Zeilen prüfen, Dubletten erkennen. Nichts Bestehendes wird überschrieben.
//
// Spalten (Kopfzeile, Groß-/Kleinschreibung egal, Reihenfolge egal):
//   Material:  Bezeichnung*, Einheit*, Einkaufspreis*
//   Leistung:  Kurztext*,    Einheit*, Kosten*
//   Ordner            Pfad mit „>“, z. B. „Farben > Dispersion“ (fehlt = ohne Ordner).
//                     Ein „/“ im Namen bleibt erhalten („Farben/ Lacke/ Spray“ ist EIN Ordner).
//   Artikelnummer (Material) bzw. Nummer (Leistung), Lieferant (nur Material)
//   Beschreibung (Material) bzw. Langtext (Leistung)
//   Zuschlag          Prozent; fehlt er, wird er aus „Verkaufspreis“ berechnet, sonst 0

import { csvAlsObjekte } from "@/lib/csv";
import { MAX_ZUSCHLAG, preisLesen, vkBerechnen, type KatalogArt } from "@/lib/katalog";
import { leistungSchema, materialSchema } from "@/lib/katalog-schema";
import { ersteMeldung } from "@/lib/nutzer-schema";

/** Ein Eintrag aus der Datei. Bei Leistungen: artikelnr = Nummer, ek = Kosten, beschreibung = Langtext. */
export type KatalogEntwurf = {
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
  entwurf?: KatalogEntwurf;
  fehler?: string;
  /** Hinweis, der den Import nicht verhindert (z. B. „Zuschlag aus Verkaufspreis berechnet“) */
  hinweis?: string;
};

export const MAX_ORDNER_TIEFE = 6;
export const MAX_ZEILEN_PRO_DATEI = 5000;

type Feld = "ordner" | "artikelnr" | "name" | "lieferant" | "einheit" | "ek" | "zuschlag" | "vk" | "beschreibung";

/** Spaltenname (kleingeschrieben, ohne Sonderzeichen) → Feld */
const SPALTEN: Record<string, Feld> = {
  ordner: "ordner", ordnerpfad: "ordner", warengruppe: "ordner", kategorie: "ordner",
  artikelnummer: "artikelnr", artikelnr: "artikelnr", artnr: "artikelnr", nummer: "artikelnr",
  bezeichnung: "name", name: "name", artikel: "name", kurztext: "name",
  lieferant: "lieferant", hersteller: "lieferant",
  einheit: "einheit", me: "einheit", mengeneinheit: "einheit",
  einkaufspreis: "ek", ek: "ek", einkauf: "ek", einkaufspreiseuro: "ek", kosten: "ek", kostenpreis: "ek",
  zuschlag: "zuschlag", aufschlag: "zuschlag", zuschlagprozent: "zuschlag",
  verkaufspreis: "vk", vk: "vk", verkauf: "vk",
  beschreibung: "beschreibung", langtext: "beschreibung",
};

export const PFLICHT_SPALTEN: Record<KatalogArt, readonly string[]> = {
  material: ["Bezeichnung", "Einheit", "Einkaufspreis"],
  leistung: ["Kurztext", "Einheit", "Kosten"],
};

function spaltenName(roh: string): string {
  return roh.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, "");
}

/** Ordnerpfad „Farben > Dispersion“ (auch „›“) in Namen zerlegen. Ein „/“ gehört zum Namen. */
export function ordnerPfadLesen(text: string): string[] {
  return text.split(/\s*[>›]\s*/).map((t) => t.trim()).filter(Boolean);
}

export function katalogAusCsv(
  art: KatalogArt,
  text: string,
): { zeilen: ImportZeile[]; fehlendeSpalten: string[]; zuViele: boolean } {
  const { spalten, zeilen } = csvAlsObjekte(text);
  const zuordnung = new Map<string, string>(); // Feld → Spaltenname in der Datei
  for (const s of spalten) {
    const feld = SPALTEN[spaltenName(s)];
    if (feld && !zuordnung.has(feld)) zuordnung.set(feld, s);
  }
  const [nameSpalte, einheitSpalte, preisSpalte] = PFLICHT_SPALTEN[art];
  const fehlend = [
    !zuordnung.has("name") && nameSpalte,
    !zuordnung.has("einheit") && einheitSpalte,
    !zuordnung.has("ek") && preisSpalte,
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

      const r =
        art === "material"
          ? materialSchema.safeParse({
              folderId: "", artikelnr: wert(z, "artikelnr"), name: wert(z, "name"), beschreibung: wert(z, "beschreibung"),
              lieferant: wert(z, "lieferant"), einheit: wert(z, "einheit"), ek: wert(z, "ek"), zuschlag: zuschlagText,
            })
          : leistungSchema.safeParse({
              folderId: "", nummer: wert(z, "artikelnr"), name: wert(z, "name"), langtext: wert(z, "beschreibung"),
              einheit: wert(z, "einheit"), kosten: wert(z, "ek"), zuschlag: zuschlagText,
            });
      if (!r.success) return { zeile: nummer, fehler: ersteMeldung(r.error) };
      const m = r.data;
      const entwurf: KatalogEntwurf =
        "artikelnr" in m
          ? { ordner, artikelnr: m.artikelnr, name: m.name, lieferant: m.lieferant, einheit: m.einheit, ek: m.ek, zuschlag: m.zuschlag, beschreibung: m.beschreibung }
          : { ordner, artikelnr: m.nummer, name: m.name, lieferant: "", einheit: m.einheit, ek: m.kosten, zuschlag: m.zuschlag, beschreibung: m.langtext };
      return { zeile: nummer, hinweis, entwurf };
    }),
  };
}

export const materialienAusCsv = (text: string) => katalogAusCsv("material", text);
export const leistungenAusCsv = (text: string) => katalogAusCsv("leistung", text);

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
 * Wann ist ein Eintrag „schon da“?
 * - Mit Artikelnummer/Nummer: gleiche Nummer beim gleichen Lieferanten.
 * - Ohne Nummer: gleicher Name, Einheit, Lieferant, Ordner UND Preis. Gleicher Name mit anderem Preis
 *   zählt als eigener Eintrag (z. B. zwei Preisstände desselben Artikels), identische Zeilen nicht.
 */
export function katalogSchluessel(m: {
  artikelnr: string;
  lieferant: string;
  name: string;
  einheit: string;
  ek: number;
  ordnerPfad: string;
}): string {
  if (m.artikelnr.trim()) return `nr|${normal(m.lieferant)}|${normal(m.artikelnr)}`;
  const name = m.name.toLowerCase().trim().replace(/\s+/g, " ");
  return `name|${normal(m.ordnerPfad)}|${name}|${normal(m.einheit)}|${normal(m.lieferant)}|${m.ek.toFixed(4)}`;
}

export function entwurfSchluessel(e: KatalogEntwurf): string {
  return katalogSchluessel({ ...e, ordnerPfad: e.ordner.join(" > ") });
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
// Vorlagen zum Herunterladen
// ---------------------------------------------------------------------------
export const VORLAGE_CSV: Record<KatalogArt, string> = {
  material:
    "Ordner;Artikelnummer;Bezeichnung;Lieferant;Einheit;Einkaufspreis;Zuschlag;Beschreibung\r\n" +
    "Farben > Dispersion;DF-125;Dispersionsfarbe weiß 12,5 l;Wilts;Eimer;19,99;30;Innen, matt\r\n" +
    "Zubehör;;Malerkrepp 50 m;;Rolle;2,49;40;\r\n",
  leistung:
    "Ordner;Nummer;Kurztext;Langtext;Einheit;Kosten;Zuschlag\r\n" +
    "Malerarbeiten;01.0010;Wandflächen weiß streichen;Zweimal streichen, Dispersionsfarbe;m²;5,65;0\r\n" +
    "Arbeitslohn;;Arbeitslohn Geselle;;Std;49,85;0\r\n",
};
