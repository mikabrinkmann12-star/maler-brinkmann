import { z } from "zod";
import { istIsoDatum } from "@/lib/datum";
import { saldoLesen, type SollEinstellung } from "@/lib/ueberstunden";
import { stundenEingabeLesen } from "@/lib/zeit-schema";

// Eingabeprüfung „Arbeitszeit & Überstunden“ in der Nutzerverwaltung (läuft auf dem Server).

export const MAX_SOLL_STUNDEN = 12;
export const MAX_SALDO = 999;

const SOLL_NAMEN = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"] as const;

/** Ein Soll-Feld: leer = Standard, sonst Stunden von 0 bis 12 („8,5“, „7:30“, „0“). */
const sollFeld = (index: number) =>
  z
    .string()
    .trim()
    .default("")
    .transform((t, ctx): number | null => {
      if (t === "") return null;
      const wert = stundenEingabeLesen(t);
      if (wert == null || wert > MAX_SOLL_STUNDEN) {
        ctx.addIssue({ code: "custom", message: `Soll ${SOLL_NAMEN[index]}: bitte Stunden von 0 bis ${MAX_SOLL_STUNDEN} eingeben (z. B. 8,5 oder 7:30) oder leer lassen.` });
        return z.NEVER;
      }
      return Math.round(wert * 100) / 100;
    });

export const arbeitszeitSchema = z
  .object({
    sollMo: sollFeld(0),
    sollDi: sollFeld(1),
    sollMi: sollFeld(2),
    sollDo: sollFeld(3),
    sollFr: sollFeld(4),
    kontoAb: z
      .string()
      .trim()
      .default("")
      .refine((t) => t === "" || istIsoDatum(t), "Bitte ein gültiges Datum für „Konto ab“ wählen (oder leer lassen).")
      .transform((t) => (t === "" ? null : t)),
    anfangssaldo: z
      .string()
      .trim()
      .default("")
      .transform((t, ctx): number => {
        if (t === "") return 0;
        const wert = saldoLesen(t);
        if (wert == null || Math.abs(wert) > MAX_SALDO) {
          ctx.addIssue({ code: "custom", message: `Anfangssaldo: bitte Stunden von -${MAX_SALDO} bis ${MAX_SALDO} eingeben (z. B. 12,5 oder -3:30).` });
          return z.NEVER;
        }
        return wert;
      }),
  })
  .superRefine((d, ctx) => {
    if (!d.kontoAb && d.anfangssaldo !== 0) {
      ctx.addIssue({ code: "custom", message: "Ein Anfangssaldo braucht ein Datum bei „Konto ab“. Ohne Datum wird kein Konto geführt." });
    }
  })
  .transform((d) => ({
    soll: [d.sollMo, d.sollDi, d.sollMi, d.sollDo, d.sollFr] as SollEinstellung,
    kontoAb: d.kontoAb,
    anfangssaldo: d.anfangssaldo,
  }));

export type ArbeitszeitWerte = z.output<typeof arbeitszeitSchema>;
