// E-Mail zum Angebot: Vorlage mit Platzhaltern und Prüfung der Eingaben (auch im Browser nutzbar).

import { z } from "zod";

export const MAIL_STANDARD_BETREFF = "Angebot: {betreff}";
export const MAIL_STANDARD_TEXT =
  "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Anfrage. Unser Angebot „{betreff}“ können Sie online ansehen und als PDF herunterladen.\n\nFür Rückfragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\n{firma}";

/** Platzhalter {betreff}, {kunde}, {firma} ersetzen; unbekannte Platzhalter bleiben stehen. */
export function mailPlatzhalter(vorlage: string, werte: { betreff: string; kunde: string; firma: string }): string {
  return vorlage.replace(/\{(betreff|kunde|firma)\}/g, (_, name: keyof typeof werte) => werte[name]);
}

const adresse = z.string().trim().max(320, "Die E-Mail-Adresse ist zu lang.").pipe(z.email("Bitte eine gültige E-Mail-Adresse eingeben."));

export const mailSchema = z.object({
  an: adresse,
  betreff: z.string().trim().min(1, "Bitte einen Betreff eingeben.").max(200, "Der Betreff ist zu lang (höchstens 200 Zeichen)."),
  text: z.string().trim().min(1, "Bitte einen Text eingeben.").max(5000, "Der Text ist zu lang (höchstens 5.000 Zeichen)."),
  /** Zusätzlich zum Link das PDF anhängen (Standard: nein, wie in Plancraft nur der Link) */
  pdfAnhaengen: z.boolean().default(false),
});

export type MailEingabe = z.input<typeof mailSchema>;

/** Betreffzeile darf keine Zeilenumbrüche enthalten (Schutz vor eingeschleusten Kopfzeilen). */
export function betreffBereinigen(betreff: string): string {
  return betreff.replace(/[\r\n]+/g, " ").trim();
}
