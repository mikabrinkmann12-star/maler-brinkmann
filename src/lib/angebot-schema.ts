// Eingaben für Angebote prüfen (zod + deutsche Zahlen). Auch im Browser nutzbar.

import { z } from "zod";
import { DOKUMENTARTEN } from "@/lib/dokumentart";
import { einzelpreisLesen, mengeLesen, zahlLesen, type BausteinTyp } from "@/lib/angebot";

const optional = (max: number, label: string) =>
  z.string({ error: `${label} fehlt.` }).trim().max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`);

function istDatum(wert: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return false;
  const d = new Date(`${wert}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === wert;
}

export const neuesAngebotSchema = z.object({
  betreff: optional(200, "Der Betreff").min(1, "Bitte den Betreff eingeben."),
  leistungsort: optional(300, "Der Leistungsort"),
  dokumentart: z.enum(DOKUMENTARTEN).optional(),
  nachtrag: z.boolean().optional(),
});

export const kopfSchema = z.object({
  betreff: optional(200, "Der Betreff").min(1, "Bitte den Betreff eingeben."),
  leistungsort: optional(300, "Der Leistungsort"),
  datum: z.string().refine(istDatum, "Bitte ein gültiges Datum wählen."),
  empfaenger: optional(500, "Der Empfänger"),
  einleitung: optional(3000, "Der Anfangstext"),
});

export const STEUER_AUSWAHL = ["19", "7", "0", "rc"] as const;
export type SteuerAuswahl = (typeof STEUER_AUSWAHL)[number];

const leerOderGanzzahl = (label: string, min: number, max: number) =>
  z.string().default("").transform((t, ctx) => {
    if (t.trim() === "") return null;
    const wert = Number(t.trim());
    if (!Number.isInteger(wert) || wert < min || wert > max) {
      ctx.addIssue({ code: "custom", message: `${label}: bitte eine ganze Zahl von ${min} bis ${max} eingeben oder leer lassen.` });
      return z.NEVER;
    }
    return wert;
  });

export const abschlussSchema = z
  .object({
    schlusstext: optional(3000, "Der Schlusstext"),
    steuer: z.enum(STEUER_AUSWAHL, { error: "Bitte die Umsatzsteuer wählen." }),
    rabatt: z.string().transform((t, ctx) => {
      const zahl = t.trim() === "" ? 0 : zahlLesen(t, 2);
      if (zahl === null || zahl < 0 || zahl > 100) {
        ctx.addIssue({ code: "custom", message: "Der Rabatt muss eine Zahl von 0 bis 100 sein." });
        return z.NEVER;
      }
      return zahl;
    }),
    zahlungsziel: leerOderGanzzahl("Zahlungsziel in Tagen", 0, 365),
    skontoProzent: z.string().default("").transform((t, ctx) => {
      if (t.trim() === "") return null;
      const zahl = zahlLesen(t, 2);
      if (zahl === null || zahl <= 0 || zahl > 20) {
        ctx.addIssue({ code: "custom", message: "Skonto: bitte einen Prozentwert von 0,01 bis 20 eingeben oder leer lassen." });
        return z.NEVER;
      }
      return zahl;
    }),
    skontoTage: leerOderGanzzahl("Skonto-Frist in Tagen", 1, 365),
    gueltigBis: z.string().default("").transform((t, ctx) => {
      if (t.trim() === "") return null;
      if (!istDatum(t)) {
        ctx.addIssue({ code: "custom", message: "Bitte ein gültiges Datum für „gültig bis“ wählen oder das Feld leeren." });
        return z.NEVER;
      }
      return t;
    }),
  })
  .refine((k) => (k.skontoProzent === null) === (k.skontoTage === null), {
    message: "Skonto braucht Prozent und Frist, oder beides leer lassen.",
    path: ["skontoTage"],
  });

/** Auswahl → Spalten der Datenbank */
export function steuerAusAuswahl(wert: SteuerAuswahl): { steuersatz: number; reverseCharge: boolean } {
  return wert === "rc" ? { steuersatz: 0, reverseCharge: true } : { steuersatz: Number(wert), reverseCharge: false };
}

export function auswahlAusSteuer(steuersatz: number, reverseCharge: boolean): SteuerAuswahl {
  if (reverseCharge) return "rc";
  return steuersatz === 7 ? "7" : steuersatz === 0 ? "0" : "19";
}

export const BAUSTEIN_TYPEN: readonly BausteinTyp[] = ["position", "titel", "text", "zwischensumme", "bild"];

export type BausteinEingabe = {
  typ: string;
  kurztext?: string;
  langtext?: string;
  menge?: string;
  einheit?: string;
  einzelpreis?: string;
};

export type BausteinDaten = {
  typ: BausteinTyp;
  kurztext: string | null;
  langtext: string | null;
  menge: number | null;
  einheit: string | null;
  einzelpreis: number | null;
};

const MAX_ZAHL = 1_000_000;

/** Baustein prüfen: je nach Art sind andere Felder Pflicht. Alle Fehlermeldungen sind deutsch. */
export function bausteinPruefen(e: BausteinEingabe): { daten: BausteinDaten } | { fehler: string } {
  const typ = BAUSTEIN_TYPEN.find((t) => t === e.typ);
  if (!typ) return { fehler: "Unbekannte Art des Bausteins." };
  const kurztext = (e.kurztext ?? "").trim();
  const langtext = (e.langtext ?? "").trim();
  if (kurztext.length > 200) return { fehler: "Der Kurztext ist zu lang (höchstens 200 Zeichen)." };
  if (langtext.length > 5000) return { fehler: "Der Langtext ist zu lang (höchstens 5.000 Zeichen)." };

  const leer: BausteinDaten = { typ, kurztext: null, langtext: null, menge: null, einheit: null, einzelpreis: null };

  if (typ === "position") {
    if (!kurztext && !langtext) return { fehler: "Bitte einen Text für die Position eingeben." };
    const mengeText = (e.menge ?? "").trim();
    const menge = mengeLesen(mengeText);
    if (menge === null || Math.abs(menge) > MAX_ZAHL) return { fehler: "Bitte die Menge als Zahl eingeben, z. B. 12,5 (höchstens 3 Nachkommastellen)." };
    const einheit = (e.einheit ?? "").trim();
    if (!einheit) return { fehler: "Bitte die Einheit eingeben, z. B. m²." };
    if (einheit.length > 20) return { fehler: "Die Einheit ist zu lang (höchstens 20 Zeichen)." };
    const preis = einzelpreisLesen((e.einzelpreis ?? "").trim());
    if (preis === null || Math.abs(preis) > MAX_ZAHL) return { fehler: "Bitte den Preis als Zahl eingeben, z. B. 11,80 (höchstens 2 Nachkommastellen)." };
    return { daten: { ...leer, kurztext: kurztext || null, langtext: langtext || null, menge, einheit, einzelpreis: preis } };
  }
  if (typ === "titel") {
    if (!kurztext) return { fehler: "Bitte den Titel eingeben." };
    return { daten: { ...leer, kurztext } };
  }
  if (typ === "text") {
    if (!langtext) return { fehler: "Bitte den Text eingeben." };
    return { daten: { ...leer, langtext } };
  }
  if (typ === "bild") return { daten: { ...leer, kurztext: kurztext || null } };
  return { daten: leer }; // Zwischensumme
}
