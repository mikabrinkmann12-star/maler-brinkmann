"use server";

import { z } from "zod";
import { requireBueroRecht } from "@/lib/auth";
import { aufmassAuswahl, type AufmassAuswahl } from "@/lib/aufmass-auswahl";
import { aufmassLaden } from "@/lib/baustellen-daten";

/** Aufmaß-Summen einer Baustelle zur Auswahl in Angebot und Rechnung (Büro und Admin). */
export async function aufmassFuerProjekt(projektId: string): Promise<{ fehler?: string; liste?: AufmassAuswahl[] }> {
  await requireBueroRecht("angebote");
  if (!z.uuid().safeParse(projektId).success) return { fehler: "Ungültiges Projekt." };
  try {
    return { liste: aufmassAuswahl(await aufmassLaden(projektId)) };
  } catch {
    return { fehler: "Das Aufmaß konnte nicht geladen werden." };
  }
}
