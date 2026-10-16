import { z } from "zod";
import { istIsoDatum } from "@/lib/datum";

// Eingabeprüfung für Projekte (Server).

const text = (max: number, meldung: string) => z.string().trim().max(max, meldung).default("");
const datum = z
  .string()
  .default("")
  .refine((d) => d === "" || istIsoDatum(d), "Bitte ein gültiges Datum wählen (oder leer lassen).");

export const projektSchema = z
  .object({
    projektnummer: z.string().trim().min(1, "Bitte eine Projektnummer eingeben.").max(40, "Die Projektnummer ist zu lang."),
    name: z.string().trim().min(1, "Bitte einen Projektnamen eingeben.").max(120, "Der Projektname ist zu lang (höchstens 120 Zeichen)."),
    contactId: z.uuid().nullish().transform((v) => v ?? null),
    statusId: z.uuid("Bitte einen Status wählen."),
    strasse: text(120, "Die Straße ist zu lang."),
    plz: text(10, "Die PLZ ist zu lang."),
    ort: text(80, "Der Ort ist zu lang."),
    startDatum: datum,
    endDatum: datum,
    beschreibung: text(2000, "Die Beschreibung ist zu lang (höchstens 2.000 Zeichen)."),
    bueroAnsprechpartnerId: z.uuid().nullish().transform((v) => v ?? null),
  })
  .refine((p) => !p.startDatum || !p.endDatum || p.endDatum >= p.startDatum, {
    message: "Das Ende darf nicht vor dem Beginn liegen.",
    path: ["endDatum"],
  });

export type ProjektDaten = z.output<typeof projektSchema>;
