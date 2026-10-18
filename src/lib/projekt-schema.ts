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
    // Leer = die App vergibt die nächste Nummer (wie in Plancraft)
    projektnummer: z.string().trim().max(40, "Die Projektnummer ist zu lang.").default(""),
    name: z.string().trim().min(1, "Bitte einen Projektnamen eingeben.").max(120, "Der Projektname ist zu lang (höchstens 120 Zeichen)."),
    contactId: z.uuid().nullish().transform((v) => v ?? null),
    statusId: z.uuid("Bitte einen Status wählen."),
    strasse: text(120, "Die Straße ist zu lang."),
    plz: text(10, "Die PLZ ist zu lang."),
    ort: text(80, "Der Ort ist zu lang."),
    land: z.string().trim().max(60, "Das Land ist zu lang.").default("").transform((l) => l || "Deutschland"),
    startDatum: datum,
    endDatum: datum,
    beschreibung: text(2000, "Die Beschreibung ist zu lang (höchstens 2.000 Zeichen)."),
    bueroAnsprechpartnerId: z.uuid().nullish().transform((v) => v ?? null),
    // Mitarbeiter des Projekts: die App setzt die Mitgliederliste genau auf diese Auswahl
    mitarbeiterIds: z.array(z.uuid()).max(60).default([]),
  })
  .refine((p) => !p.startDatum || !p.endDatum || p.endDatum >= p.startDatum, {
    message: "Das Ende darf nicht vor dem Beginn liegen.",
    path: ["endDatum"],
  });

export type ProjektDaten = z.output<typeof projektSchema>;
