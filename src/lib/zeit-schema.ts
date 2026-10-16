import { z } from "zod";
import { istIsoDatum } from "@/lib/datum";
import {
  MAX_KULANZ_TAGE,
  MAX_PAUSE_MIN,
  MITARBEITER_ARTEN,
  ZEIT_ARTEN,
  arbeitsMinuten,
  brauchtProjekt,
  istUhrzeit,
  stundenAusMinuten,
  type ZeitArt,
} from "@/lib/zeiten";

// Eingabeprüfung für die Zeiterfassung (läuft auf dem Server, Tests im Browser-Code möglich).

const uhrzeit = (meldung: string) => z.string().refine(istUhrzeit, meldung);
const ganzeMinuten = z.coerce
  .number({ error: "Bitte die Pause in Minuten angeben." })
  .int("Bitte die Pause in ganzen Minuten angeben.")
  .min(0, "Die Pause kann nicht negativ sein.")
  .max(MAX_PAUSE_MIN, `Die Pause darf höchstens ${MAX_PAUSE_MIN} Minuten lang sein.`);

// ---------------------------------------------------------------------------
// Einstellungen „Zeiterfassung“ (Admin)
// ---------------------------------------------------------------------------
export const einstellungenSchema = z
  .object({
    erlaubteArten: z
      .array(z.enum(MITARBEITER_ARTEN, { error: "Unbekannte Zeit-Art." }))
      .min(1, "Bitte mindestens eine Art für Mitarbeiter erlauben."),
    standardBeginn: uhrzeit("Bitte einen Standard-Beginn eingeben (z. B. 06:30)."),
    standardEnde: uhrzeit("Bitte ein Standard-Ende eingeben (z. B. 15:45)."),
    standardPauseMin: ganzeMinuten,
    freitagEnde: uhrzeit("Bitte das Ende am Freitag eingeben (z. B. 12:45)."),
    freitagPauseMin: ganzeMinuten,
    kulanzTage: z.coerce
      .number({ error: "Bitte die Kulanztage angeben." })
      .int("Bitte ganze Tage angeben.")
      .min(0, "Die Kulanztage können nicht negativ sein.")
      .max(MAX_KULANZ_TAGE, `Höchstens ${MAX_KULANZ_TAGE} Kulanztage.`),
  })
  .superRefine((d, ctx) => {
    const r = arbeitsMinuten(d.standardBeginn, d.standardEnde, d.standardPauseMin);
    if ("fehler" in r) ctx.addIssue({ code: "custom", message: `Standardzeiten: ${r.fehler}` });
    const f = arbeitsMinuten(d.standardBeginn, d.freitagEnde, d.freitagPauseMin);
    if ("fehler" in f) ctx.addIssue({ code: "custom", message: `Freitag: ${f.fehler}` });
  })
  .transform((d) => ({ ...d, erlaubteArten: MITARBEITER_ARTEN.filter((a) => d.erlaubteArten.includes(a)) }));

// ---------------------------------------------------------------------------
// Ein Zeiteintrag
// ---------------------------------------------------------------------------
export const zeitDatenSchema = z
  .object({
    datum: z.string().refine(istIsoDatum, "Bitte ein gültiges Datum wählen."),
    projektId: z.uuid("Bitte eine Baustelle wählen.").nullable(),
    art: z.enum(ZEIT_ARTEN, { error: "Bitte eine Art wählen." }),
    modus: z.enum(["uhrzeit", "stunden"]),
    von: z.string().default(""),
    bis: z.string().default(""),
    pauseMin: ganzeMinuten.default(0),
    stunden: z.number().min(0).max(24).default(0),
    beschreibung: z.string().trim().max(500, "Die Beschreibung ist zu lang (höchstens 500 Zeichen).").default(""),
  })
  .superRefine((d, ctx) => {
    if (brauchtProjekt(d.art) && !d.projektId) {
      ctx.addIssue({ code: "custom", message: "Bei Arbeits- und Fahrtzeit bitte eine Baustelle wählen." });
    }
    if (d.modus === "uhrzeit") {
      const r = arbeitsMinuten(d.von, d.bis, d.pauseMin);
      if ("fehler" in r) ctx.addIssue({ code: "custom", message: r.fehler });
    } else if (!(d.stunden > 0)) {
      ctx.addIssue({ code: "custom", message: "Bitte die Stunden eingeben (mehr als 0)." });
    }
  });

export type ZeitDaten = z.input<typeof zeitDatenSchema>;
export type GepruefteZeitDaten = z.output<typeof zeitDatenSchema>;

/** Neue Einträge: für mich und ggf. Kollegen. Jede Person bekommt eine eigene, vorab erzeugte ID. */
export const neueZeitSchema = z.object({
  daten: zeitDatenSchema,
  personen: z
    .array(z.object({ eintragId: z.uuid(), userId: z.uuid() }))
    .min(1, "Für wen soll die Zeit eingetragen werden?")
    .max(20, "Höchstens 20 Personen auf einmal."),
});

/** Felder für die Tabelle time_entries (ohne user_id/id). */
export function zeitZeile(d: GepruefteZeitDaten): {
  datum: string;
  project_id: string | null;
  art: ZeitArt;
  von: string | null;
  bis: string | null;
  pause_min: number;
  stunden: number;
  beschreibung: string | null;
} {
  const mitUhrzeit = d.modus === "uhrzeit";
  const r = mitUhrzeit ? arbeitsMinuten(d.von, d.bis, d.pauseMin) : null;
  return {
    datum: d.datum,
    project_id: d.projektId,
    art: d.art,
    von: mitUhrzeit ? d.von : null,
    bis: mitUhrzeit ? d.bis : null,
    pause_min: mitUhrzeit ? d.pauseMin : 0,
    // Bei Uhrzeiten rechnet die Datenbank selbst nach (Trigger), der Wert hier ist gleich.
    stunden: r && "minuten" in r ? stundenAusMinuten(r.minuten) : Math.round(d.stunden * 100) / 100,
    beschreibung: d.beschreibung || null,
  };
}

/** Stunden-Eingabe lesen: „8,5“, „8.5“, „8:30“ oder „8“ → 8.5 bzw. 8. Unlesbar → null. */
export function stundenEingabeLesen(text: string): number | null {
  const t = text.trim().replace(/\s*(std\.?|h)$/i, "");
  const mitDoppelpunkt = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  if (mitDoppelpunkt) return Number(mitDoppelpunkt[1]) + Number(mitDoppelpunkt[2]) / 60;
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(t)) return null;
  return Number(t.replace(",", "."));
}
