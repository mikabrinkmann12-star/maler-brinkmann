import { z } from "zod";
import { MAX_PREIS, MAX_ZUSCHLAG, preisLesen, zuschlagLesen } from "@/lib/katalog";

// Eingabeprüfung für den Katalog (läuft auf dem Server). Die Felder kommen als Text aus
// dem Formular, Preise und Zuschlag werden hier in Zahlen umgewandelt.

const text = (max: number, meldung: string) => z.string().trim().max(max, meldung).default("");

const ordnerId = z
  .string()
  .default("")
  .pipe(z.union([z.literal(""), z.uuid("Ungültiger Ordner.")]))
  .transform((v) => (v === "" ? null : v));

export const ordnerSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen für den Ordner eingeben.").max(100, "Der Name ist zu lang (höchstens 100 Zeichen)."),
  parentId: ordnerId,
});

const einheit = z.string().trim().min(1, "Bitte eine Einheit angeben (z. B. Stk, m², Std).").max(20, "Die Einheit ist zu lang (höchstens 20 Zeichen).");

/** Preis-Feld: leer = 0, sonst „12,50“ usw. */
const preis = (feld: string) =>
  z
    .string()
    .trim()
    .default("")
    .transform((t, ctx): number => {
      if (t === "") return 0;
      const wert = preisLesen(t);
      if (wert == null || wert > MAX_PREIS) {
        ctx.addIssue({ code: "custom", message: `${feld}: bitte einen Betrag von 0 bis ${MAX_PREIS.toLocaleString("de-DE")} € eingeben (z. B. 12,50).` });
        return z.NEVER;
      }
      return wert;
    });

const zuschlag = z
  .string()
  .trim()
  .default("")
  .transform((t, ctx): number => {
    if (t === "") return 0;
    const wert = zuschlagLesen(t);
    if (wert == null) {
      ctx.addIssue({ code: "custom", message: `Zuschlag: bitte Prozent von 0 bis ${MAX_ZUSCHLAG} eingeben (z. B. 25 oder 12,5).` });
      return z.NEVER;
    }
    return wert;
  });

export const materialSchema = z.object({
  folderId: ordnerId,
  artikelnr: text(50, "Die Artikelnummer ist zu lang (höchstens 50 Zeichen)."),
  name: z.string().trim().min(1, "Bitte eine Bezeichnung eingeben.").max(200, "Die Bezeichnung ist zu lang (höchstens 200 Zeichen)."),
  beschreibung: text(2000, "Die Beschreibung ist zu lang (höchstens 2.000 Zeichen)."),
  lieferant: text(100, "Der Lieferant ist zu lang (höchstens 100 Zeichen)."),
  einheit,
  ek: preis("Einkaufspreis"),
  zuschlag,
});

export const leistungSchema = z.object({
  folderId: ordnerId,
  nummer: text(50, "Die Nummer ist zu lang (höchstens 50 Zeichen)."),
  name: z.string().trim().min(1, "Bitte einen Kurztext eingeben.").max(200, "Der Kurztext ist zu lang (höchstens 200 Zeichen)."),
  langtext: text(5000, "Der Langtext ist zu lang (höchstens 5.000 Zeichen)."),
  einheit,
  kosten: preis("Kosten"),
  zuschlag,
});

export type OrdnerEingabe = z.input<typeof ordnerSchema>;
export type MaterialEingabe = z.input<typeof materialSchema>;
export type LeistungEingabe = z.input<typeof leistungSchema>;
