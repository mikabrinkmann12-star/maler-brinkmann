"use server";

import { requireRole } from "@/lib/auth";
import { lexwareClient } from "@/lib/lexware";
import { LexwareFehler } from "@/lib/lexware-client";

/** Verbindung zu Lexware Office prüfen (nur Admin): fragt nur das Profil des Kontos ab, ändert nichts. */
export async function lexwareVerbindungTesten(): Promise<{ fehler?: string; konto?: { email: string; funktionen: string[]; kleinunternehmer: boolean | null } }> {
  await requireRole(["admin"]);
  const client = lexwareClient();
  if (!client) return { fehler: "Es ist kein API-Schlüssel hinterlegt (LEXWARE_API_KEY)." };
  try {
    const profil = await client.profil();
    return { konto: { email: profil.email, funktionen: profil.funktionen, kleinunternehmer: profil.kleinunternehmer } };
  } catch (fehler) {
    return { fehler: fehler instanceof LexwareFehler ? fehler.message : "Die Verbindung hat nicht geklappt." };
  }
}
