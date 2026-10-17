"use server";

import { requireRole } from "@/lib/auth";
import { lexwareClient } from "@/lib/lexware";
import { LexwareFehler } from "@/lib/lexware-client";

/** Verbindung zu Lexware Office prüfen (nur Admin): fragt nur den Firmennamen des Kontos ab, ändert nichts. */
export async function lexwareVerbindungTesten(): Promise<{ fehler?: string; firma?: string }> {
  await requireRole(["admin"]);
  const client = lexwareClient();
  if (!client) return { fehler: "Es ist kein API-Schlüssel hinterlegt (LEXWARE_API_KEY)." };
  try {
    const profil = await client.profil();
    return { firma: profil.firma || "(ohne Firmennamen)" };
  } catch (fehler) {
    return { fehler: fehler instanceof LexwareFehler ? fehler.message : "Die Verbindung hat nicht geklappt." };
  }
}
