// Textvorlagen für Angebote: Prüfung der Eingaben (auch im Browser nutzbar).

import { z } from "zod";

export type TextvorlageArt = "einleitung" | "schlusstext";

export const TEXTVORLAGE_ART_NAMEN: Record<TextvorlageArt, string> = {
  einleitung: "Anfangstext",
  schlusstext: "Schlusstext",
};

export function istTextvorlageArt(wert: unknown): wert is TextvorlageArt {
  return wert === "einleitung" || wert === "schlusstext";
}

export const vorlageSchema = z.object({
  art: z.enum(["einleitung", "schlusstext"], { error: "Bitte die Art wählen (Anfangs- oder Schlusstext)." }),
  name: z.string().trim().min(1, "Bitte einen Namen eingeben.").max(80, "Der Name ist zu lang (höchstens 80 Zeichen)."),
  inhalt: z.string().trim().min(1, "Bitte den Text eingeben.").max(3000, "Der Text ist zu lang (höchstens 3.000 Zeichen)."),
  standard: z.boolean(),
});

export type VorlageEingabe = z.input<typeof vorlageSchema>;

export type Textvorlage = {
  id: string;
  art: TextvorlageArt;
  name: string;
  inhalt: string;
  standard: boolean;
};

/** Die Standard-Vorlage einer Art (oder null). */
export function standardVorlage(vorlagen: Textvorlage[], art: TextvorlageArt): Textvorlage | null {
  return vorlagen.find((v) => v.art === art && v.standard) ?? null;
}

/** Vorlagen einer Art, Standard zuerst, sonst nach Namen. */
export function vorlagenDerArt(vorlagen: Textvorlage[], art: TextvorlageArt): Textvorlage[] {
  return vorlagen
    .filter((v) => v.art === art)
    .sort((a, b) => Number(b.standard) - Number(a.standard) || a.name.localeCompare(b.name, "de"));
}
