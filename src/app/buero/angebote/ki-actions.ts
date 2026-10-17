"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { MAX_KI_BESCHREIBUNG, kiAnbieter, type KiErgebnis } from "@/lib/ki";
import { BUERO_ROLLEN } from "@/lib/rollen";

/**
 * KI-Vorschlag für ein Angebot (heute nur Platzhalter, es geht nichts an einen Dienst).
 * Die Aktion speichert nie etwas: Ein Vorschlag wird erst vom Büro übernommen.
 */
export async function kiVorschlagen(angebotId: string, beschreibung: string): Promise<KiErgebnis | { fehler: string }> {
  await requireRole(BUERO_ROLLEN);
  if (!z.uuid().safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  const text = beschreibung.trim();
  if (!text) return { fehler: "Bitte beschreibe kurz, was gemacht werden soll." };
  if (text.length > MAX_KI_BESCHREIBUNG) return { fehler: `Die Beschreibung ist zu lang (höchstens ${MAX_KI_BESCHREIBUNG} Zeichen).` };
  return kiAnbieter().angebotVorschlagen(text);
}
