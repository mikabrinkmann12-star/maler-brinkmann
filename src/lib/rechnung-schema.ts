// Eingaben für Rechnungen prüfen (zod + deutsche Zahlen). Auch im Browser nutzbar.

import { z } from "zod";
import { STEUER_AUSWAHL, bausteinPruefen } from "@/lib/angebot-schema";
import { zahlLesen } from "@/lib/angebot";
import type { RechnungsBaustein } from "@/lib/rechnung";

function istDatum(wert: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return false;
  const d = new Date(`${wert}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === wert;
}

const optional = (max: number, label: string) =>
  z.string({ error: `${label} fehlt.` }).trim().max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`);

const ganzeZahl = (label: string, min: number, max: number) =>
  z.string().transform((t, ctx) => {
    const wert = Number(t.trim());
    if (t.trim() === "" || !Number.isInteger(wert) || wert < min || wert > max) {
      ctx.addIssue({ code: "custom", message: `${label}: bitte eine ganze Zahl von ${min} bis ${max} eingeben.` });
      return z.NEVER;
    }
    return wert;
  });

export const rechnungKopfSchema = z
  .object({
    betreff: optional(200, "Der Betreff").min(1, "Bitte den Betreff eingeben."),
    rechnungsdatum: z.string().refine(istDatum, "Bitte ein gültiges Rechnungsdatum wählen."),
    leistungVon: z.string().refine(istDatum, "Bitte ein gültiges Datum für den Beginn der Leistung wählen."),
    leistungBis: z.string().refine(istDatum, "Bitte ein gültiges Datum für das Ende der Leistung wählen."),
    zahlungsziel: ganzeZahl("Zahlungsziel in Tagen", 0, 365),
    skontoProzent: z.string().transform((t, ctx) => {
      if (t.trim() === "") return null;
      const zahl = zahlLesen(t, 2);
      if (zahl === null || zahl <= 0 || zahl > 20) {
        ctx.addIssue({ code: "custom", message: "Skonto: bitte einen Prozentwert von 0,01 bis 20 eingeben oder leer lassen." });
        return z.NEVER;
      }
      return zahl;
    }),
    skontoTage: z.string().transform((t, ctx) => {
      if (t.trim() === "") return null;
      const wert = Number(t.trim());
      if (!Number.isInteger(wert) || wert < 1 || wert > 365) {
        ctx.addIssue({ code: "custom", message: "Skonto-Frist: bitte eine ganze Zahl von 1 bis 365 Tagen eingeben oder leer lassen." });
        return z.NEVER;
      }
      return wert;
    }),
    steuer: z.enum(STEUER_AUSWAHL, { error: "Bitte die Umsatzsteuer wählen." }),
    rabatt: z.string().transform((t, ctx) => {
      const zahl = t.trim() === "" ? 0 : zahlLesen(t, 2);
      if (zahl === null || zahl < 0 || zahl > 100) {
        ctx.addIssue({ code: "custom", message: "Der Rabatt muss eine Zahl von 0 bis 100 sein." });
        return z.NEVER;
      }
      return zahl;
    }),
    einleitung: optional(3000, "Der Anfangstext"),
    schlusstext: optional(3000, "Der Schlusstext"),
  })
  .refine((k) => k.leistungBis >= k.leistungVon, { message: "Das Ende der Leistung darf nicht vor dem Beginn liegen.", path: ["leistungBis"] })
  .refine((k) => (k.skontoProzent === null) === (k.skontoTage === null), { message: "Skonto braucht Prozent und Frist, oder beides leer lassen.", path: ["skontoTage"] });

export type RechnungKopfEingabe = z.input<typeof rechnungKopfSchema>;

export type RechnungBausteinEingabe = {
  typ: string;
  kurztext?: string;
  langtext?: string;
  menge?: string;
  einheit?: string;
  einzelpreis?: string;
};

/** Baustein einer Rechnung prüfen: Position (wie im Angebot) oder Textzeile (Kurz- oder Langtext). */
export function rechnungBausteinPruefen(e: RechnungBausteinEingabe): { daten: RechnungsBaustein } | { fehler: string } {
  if (e.typ === "text") {
    const kurztext = (e.kurztext ?? "").trim();
    const langtext = (e.langtext ?? "").trim();
    if (!kurztext && !langtext) return { fehler: "Bitte einen Text eingeben." };
    if (kurztext.length > 200) return { fehler: "Der Kurztext ist zu lang (höchstens 200 Zeichen)." };
    if (langtext.length > 5000) return { fehler: "Der Text ist zu lang (höchstens 5.000 Zeichen)." };
    return { daten: { typ: "text", kurztext, langtext, menge: null, einheit: "", einzelpreis: null } };
  }
  if (e.typ !== "position") return { fehler: "Unbekannte Art des Bausteins." };
  const r = bausteinPruefen(e);
  if ("fehler" in r) return { fehler: r.fehler };
  const d = r.daten;
  return { daten: { typ: "position", kurztext: d.kurztext ?? "", langtext: d.langtext ?? "", menge: d.menge, einheit: d.einheit ?? "", einzelpreis: d.einzelpreis } };
}
