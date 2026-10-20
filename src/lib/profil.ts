import { z } from "zod";

// Eigenes Profil und Benachrichtigungs-Wünsche in der Mitarbeiter-App.
// Auch im Browser nutzbar.

export const profilSchema = z.object({
  vorname: z.string().trim().min(1, "Bitte einen Vornamen eingeben.").max(50, "Der Vorname ist zu lang."),
  nachname: z.string().trim().max(50, "Der Nachname ist zu lang.").default(""),
  telefon: z.string().trim().max(30, "Die Mobilnummer ist zu lang.").default(""),
});

/** Schalter wie in Plancraft. Push gibt es noch nicht, die Wahl wird nur gespeichert. */
export const BENACHRICHTIGUNGEN = [
  { schluessel: "projekt_zugewiesen", name: "Projekt zugewiesen", text: "Du wirst zu einem Projekt hinzugefügt oder für einen Einsatz eingeplant." },
  { schluessel: "chat", name: "Nachrichten im Chat", text: "Neue Nachrichten in den Chats deiner Projekte." },
  { schluessel: "arbeitszeit", name: "Arbeitszeit erfassen", text: "Erinnerung an Arbeitstagen, deine Zeit einzutragen." },
  { schluessel: "urlaub", name: "Urlaubsanträge", text: "Wenn über deinen Urlaubsantrag entschieden wurde." },
] as const;

export type BenachrichtigungSchluessel = (typeof BENACHRICHTIGUNGEN)[number]["schluessel"];
export type BenachrichtigungenWahl = Record<BenachrichtigungSchluessel, boolean>;

/** Gespeicherter Wert → vollständige Wahl (was fehlt, ist eingeschaltet). */
export function benachrichtigungenLesen(wert: unknown): BenachrichtigungenWahl {
  const roh = wert && typeof wert === "object" && !Array.isArray(wert) ? (wert as Record<string, unknown>) : {};
  const ergebnis = {} as BenachrichtigungenWahl;
  for (const { schluessel } of BENACHRICHTIGUNGEN) ergebnis[schluessel] = roh[schluessel] !== false;
  return ergebnis;
}

export const benachrichtigungenSchema = z.object({
  projekt_zugewiesen: z.boolean(),
  chat: z.boolean(),
  arbeitszeit: z.boolean(),
  urlaub: z.boolean(),
});

/** Initialen für den Kreis („Mika Brinkmann“ → „MB“). */
export function initialen(vorname: string, nachname: string): string {
  const v = vorname.trim()[0] ?? "";
  const n = nachname.trim()[0] ?? "";
  return (v + n).toUpperCase() || "?";
}
