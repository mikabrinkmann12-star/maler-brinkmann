// Angebot online annehmen oder ablehnen (Mika, 13.11.2026). Reine Regeln, ohne Datenbank (testbar, auch im Browser nutzbar).
import { z } from "zod";

export type KundenAntwort = "angenommen" | "abgelehnt";

export const antwortSchema = z.discriminatedUnion("antwort", [
  z.object({
    antwort: z.literal("angenommen"),
    name: z.string().trim().min(2, "Bitte Ihren Namen eintragen.").max(120),
    bestaetigt: z.literal(true, { error: "Bitte bestätigen Sie die verbindliche Annahme." }),
  }),
  z.object({
    antwort: z.literal("abgelehnt"),
    name: z.string().trim().max(120).optional().default(""),
    grund: z.string().trim().max(1000).optional().default(""),
  }),
]);

/** Darf der Kunde über die Online-Ansicht noch antworten? Gibt den Grund zurück, wenn nicht. */
export function antwortMoeglich(a: { status: string; gueltigBis: string | null; schonGeantwortet: boolean }, heute: string): { ok: true } | { ok: false; grund: string } {
  if (a.schonGeantwortet || a.status === "angenommen" || a.status === "abgelehnt") return { ok: false, grund: "Zu diesem Angebot liegt schon eine Antwort vor." };
  if (a.status !== "versendet") return { ok: false, grund: "Dieses Angebot kann gerade nicht online angenommen werden. Bitte melden Sie sich bei uns." };
  if (a.gueltigBis && a.gueltigBis < heute) return { ok: false, grund: "Dieses Angebot ist abgelaufen. Bitte melden Sie sich bei uns, wir schicken Ihnen gern ein neues." };
  return { ok: true };
}
