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

// ---- Erwähnungen (@Name) ----------------------------------------------------------------
// Es gibt keine eigene Tabelle: Eine Nachricht erwähnt jemanden, wenn im Text „@Vorname“ oder
// „@Vorname Nachname“ steht. So braucht der Reiter „Erwähnungen“ keine Migration.

const BUCHSTABE = "\\p{L}\\p{N}_";

function regexSicher(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wird die Person im Text mit @ erwähnt? „@Anna“ und „@Anna Meier“ zählen, Groß-/Kleinschreibung egal.
 * Das @ darf nicht mitten in einem Wort stehen (E-Mail-Adressen zählen nicht), und der Name muss am Wortende enden.
 * Grenze: Gibt es zwei „Anna“, erwähnt „@Anna Schulz“ auch die andere Anna (Vorname allein reicht).
 */
export function erwaehnt(text: string, vorname: string, nachname: string): boolean {
  const v = vorname.trim();
  if (!v || !text.includes("@")) return false;
  const n = nachname.trim();
  const namen = [n ? `${v} ${n}` : "", v].filter(Boolean);
  return namen.some((name) => {
    const muster = regexSicher(name).replace(/\s+/g, "\\s+");
    return new RegExp(`(?<![${BUCHSTABE}.])@${muster}(?![${BUCHSTABE}])`, "iu").test(text);
  });
}

export type ErwaehnbarePerson = { id: string; name: string };

const ANGEFANGEN = /(?:^|\s)@([\p{L}-]*(?:\s[\p{L}-]*)?)$/u;

/** Während man „@An“ tippt: passende Personen (höchstens 5). Nur, wenn das @ am Wortanfang steht und der Rest kurz ist. */
export function erwaehnungsVorschlaege(text: string, personen: ErwaehnbarePerson[], max = 5): ErwaehnbarePerson[] {
  const treffer = ANGEFANGEN.exec(text);
  if (!treffer) return [];
  const fragment = treffer[1].toLowerCase();
  return personen
    .filter((p) => {
      const klein = p.name.toLowerCase();
      return klein.startsWith(fragment) || klein.split(/\s+/).some((teil) => teil.startsWith(fragment));
    })
    .slice(0, max);
}

/** Ersetzt das angefangene „@An“ am Ende des Textes durch „@Anna Meier “. */
export function erwaehnungEinsetzen(text: string, name: string): string {
  const treffer = ANGEFANGEN.exec(text);
  if (!treffer) return text;
  const at = text.length - treffer[1].length - 1;
  return `${text.slice(0, at)}@${name} `;
}

/** Ungelesen-Zähler aus der Datenbankfunktion `chat_ungelesen()` als Nachschlagetabelle. */
export function ungelesenKarte(zeilen: { project_id: string; anzahl: number | string }[] | null | undefined): Map<string, number> {
  return new Map((zeilen ?? []).map((z) => [z.project_id, Number(z.anzahl)]));
}
