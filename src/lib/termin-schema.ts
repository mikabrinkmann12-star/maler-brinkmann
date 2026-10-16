import { z } from "zod";
import { istIsoDatum } from "@/lib/datum";
import { istUhrzeit } from "@/lib/zeiten";

// Eingabeprüfung für Termine (Kalender). Läuft auf dem Server und im Browser.

export const terminSchema = z.object({
  id: z.uuid(),
  datum: z.string().refine(istIsoDatum, "Bitte ein gültiges Datum wählen."),
  titel: z.string().trim().min(1, "Bitte einen Titel eingeben (z. B. „Zu von Garrel“).").max(120, "Der Titel ist zu lang (höchstens 120 Zeichen)."),
  /** "HH:MM" oder leer */
  zeit: z.string().default("").refine((z) => z === "" || istUhrzeit(z), "Bitte eine gültige Uhrzeit wählen (oder leer lassen)."),
  ort: z.string().trim().max(120, "Der Ort ist zu lang.").default(""),
  projectId: z.uuid().nullable().default(null),
  notiz: z.string().trim().max(500, "Die Notiz ist zu lang (höchstens 500 Zeichen).").default(""),
  personIds: z.array(z.uuid()).max(30).default([]),
});

export type TerminEingabe = z.input<typeof terminSchema>;
export type TerminDaten = z.output<typeof terminSchema>;
