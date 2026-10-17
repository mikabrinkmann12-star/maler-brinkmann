// Projekt-Chat: Prüfung einer Nachricht und kleine Hilfen für die Anzeige (auch im Browser nutzbar).
import { z } from "zod";
import { heuteIso, tageVerschieben } from "@/lib/datum";

export const CHAT_MAX_ZEICHEN = 2000;

/** Eine Nachricht: Text und/oder genau ein Anhang (Foto oder Datei). Die ID erzeugt die App (mehrfaches Senden ist unschädlich). */
export const nachrichtSchema = z
  .object({
    id: z.uuid(),
    projektId: z.uuid(),
    text: z.string().trim().max(CHAT_MAX_ZEICHEN, `Die Nachricht ist zu lang (höchstens ${CHAT_MAX_ZEICHEN.toLocaleString("de-DE")} Zeichen).`).default(""),
    fotoId: z.uuid().nullish(),
    dateiId: z.uuid().nullish(),
  })
  .refine((n) => n.text !== "" || n.fotoId || n.dateiId, { message: "Bitte etwas schreiben oder einen Anhang wählen." })
  .refine((n) => !(n.fotoId && n.dateiId), { message: "Pro Nachricht ist nur ein Anhang möglich." });

/** Zahl auf der Kachel: leer bei 0, „99+“ ab 100. */
export function zaehlerText(anzahl: number): string {
  if (anzahl <= 0) return "";
  return anzahl > 99 ? "99+" : String(anzahl);
}

/** Datum (Berlin) einer Nachricht als JJJJ-MM-TT. */
export function nachrichtTag(erstelltAm: string): string {
  return heuteIso(new Date(erstelltAm));
}

/** Überschrift über den Nachrichten eines Tages: „Heute“, „Gestern“ oder „Mi., 14.10.2026“. */
export function tagesUeberschrift(tagIso: string, jetzt: Date = new Date(), langesDatum: (iso: string) => string): string {
  const heute = heuteIso(jetzt);
  if (tagIso === heute) return "Heute";
  if (tagIso === tageVerschieben(heute, -1)) return "Gestern";
  return langesDatum(tagIso);
}

/** Nachrichten (alt → neu) in Tagesgruppen zerlegen. */
export function nachTagen<T extends { created_at: string }>(nachrichten: T[]): { tag: string; nachrichten: T[] }[] {
  const gruppen: { tag: string; nachrichten: T[] }[] = [];
  for (const n of nachrichten) {
    const tag = nachrichtTag(n.created_at);
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.tag === tag) letzte.nachrichten.push(n);
    else gruppen.push({ tag, nachrichten: [n] });
  }
  return gruppen;
}

/** Ungelesen-Zähler aus der Datenbankfunktion `chat_ungelesen()` als Nachschlagetabelle. */
export function ungelesenKarte(zeilen: { project_id: string; anzahl: number | string }[] | null | undefined): Map<string, number> {
  return new Map((zeilen ?? []).map((z) => [z.project_id, Number(z.anzahl)]));
}
