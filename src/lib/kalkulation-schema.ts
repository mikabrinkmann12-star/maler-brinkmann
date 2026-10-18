import { z } from "zod";
import { MAX_PREIS, MAX_ZUSCHLAG, preisLesen, zuschlagLesen } from "@/lib/katalog";

// Eingabeprüfung für die Kalkulation (läuft auf dem Server). Die Felder kommen als Text aus dem Formular („12,50“, „7,5“).

/** Betrag oder Menge: leer = 0, sonst deutsche Zahl von 0 bis `max`. */
const zahl = (feld: string, max: number, einheit: string) =>
  z
    .string()
    .trim()
    .default("")
    .transform((t, ctx): number => {
      if (t === "") return 0;
      const wert = preisLesen(t);
      if (wert == null || wert > max) {
        ctx.addIssue({ code: "custom", message: `${feld}: bitte eine Zahl von 0 bis ${max.toLocaleString("de-DE")}${einheit} eingeben (z. B. 12,5).` });
        return z.NEVER;
      }
      return wert;
    });

const prozent = (feld: string) =>
  z
    .string()
    .trim()
    .default("")
    .transform((t, ctx): number => {
      if (t === "") return 0;
      const wert = zuschlagLesen(t);
      if (wert == null) {
        ctx.addIssue({ code: "custom", message: `${feld}: bitte Prozent von 0 bis ${MAX_ZUSCHLAG} eingeben (z. B. 40 oder 12,5).` });
        return z.NEVER;
      }
      return wert;
    });

/** Zusammensetzung einer Leistung (je Einheit der Leistung). */
export const kalkulationEingabeSchema = z.object({
  lohngruppeId: z.string().trim().max(40).default(""),
  lohnMinuten: zahl("Lohn (Minuten)", 100_000, " Minuten"),
  material: zahl("Material", MAX_PREIS, " €"),
  geraete: zahl("Geräte", MAX_PREIS, " €"),
  fremdleistung: zahl("Fremdleistung", MAX_PREIS, " €"),
  sonstiges: zahl("Sonstiges", MAX_PREIS, " €"),
});

export type KalkulationEingabeText = z.input<typeof kalkulationEingabeSchema>;

const lohngruppe = z
  .object({
    id: z.string().trim().max(40).default(""),
    name: z.string().trim().min(1, "Bitte jeder Lohngruppe einen Namen geben.").max(60, "Der Name einer Lohngruppe ist zu lang (höchstens 60 Zeichen)."),
    lohnkosten: zahl("Lohnkosten", 1000, " € je Stunde"),
    verrechnungssatz: zahl("Verrechnungssatz", 1000, " € je Stunde"),
  })
  .refine((g) => g.verrechnungssatz >= g.lohnkosten, { message: "Der Verrechnungssatz darf nicht unter den Lohnkosten liegen.", path: ["verrechnungssatz"] });

/** Einstellungen der Kalkulation: Zuschläge je Kostenart und die Lohngruppen. */
export const kalkulationEinstellungenSchema = z
  .object({
    material: prozent("Zuschlag Material"),
    geraete: prozent("Zuschlag Geräte"),
    fremdleistung: prozent("Zuschlag Fremdleistung"),
    sonstiges: prozent("Zuschlag Sonstiges"),
    lohngruppen: z.array(lohngruppe).min(1, "Es braucht mindestens eine Lohngruppe.").max(10, "Höchstens 10 Lohngruppen."),
  })
  .refine((e) => new Set(e.lohngruppen.map((g) => g.name.toLowerCase())).size === e.lohngruppen.length, { message: "Jede Lohngruppe braucht einen eigenen Namen.", path: ["lohngruppen"] });

export type KalkulationEinstellungenText = z.input<typeof kalkulationEinstellungenSchema>;
