import { z } from "zod";
import { BENUTZERNAME_MUSTER, MIN_PASSWORT_LAENGE } from "@/lib/login";

// Eingabeprüfung für die Nutzerverwaltung (läuft auf dem Server).

const optionalerText = (max: number, meldung: string) =>
  z.string().trim().max(max, meldung).default("");

export const stammdatenSchema = z.object({
  vorname: z
    .string()
    .trim()
    .min(1, "Bitte einen Vornamen eingeben.")
    .max(50, "Der Vorname ist zu lang."),
  nachname: optionalerText(50, "Der Nachname ist zu lang."),
  rolle: z.enum(["admin", "buero", "mitarbeiter"], {
    error: "Bitte eine Rolle wählen.",
  }),
  telefon: optionalerText(30, "Die Telefonnummer ist zu lang."),
  email: z
    .string()
    .trim()
    .default("")
    .pipe(
      z.union([
        z.literal(""),
        z.email("Bitte eine gültige E-Mail-Adresse eingeben (oder leer lassen)."),
      ]),
    ),
  /** Urlaubsanspruch pro Kalenderjahr in Werktagen, leer = nicht eingetragen */
  urlaubstage: z
    .string()
    .trim()
    .default("")
    .refine((t) => t === "" || (/^\d{1,2}$/.test(t) && Number(t) <= 60), "Urlaubstage: bitte eine Zahl von 0 bis 60 (oder leer lassen).")
    .transform((t) => (t === "" ? null : Number(t))),
});

export const neuerNutzerSchema = stammdatenSchema.extend({
  benutzername: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      BENUTZERNAME_MUSTER,
      "Benutzername: 2–31 Zeichen, nur a–z, 0–9, Punkt, Bindestrich oder Unterstrich (keine Umlaute, kein Leerzeichen).",
    ),
  passwort: z
    .string()
    .min(
      MIN_PASSWORT_LAENGE,
      `Das Startpasswort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen haben.`,
    ),
});

export type Stammdaten = z.infer<typeof stammdatenSchema>;

/** Erste verständliche Fehlermeldung aus einer fehlgeschlagenen Prüfung. */
export function ersteMeldung(fehler: z.ZodError): string {
  return fehler.issues[0]?.message ?? "Bitte die Eingaben prüfen.";
}
