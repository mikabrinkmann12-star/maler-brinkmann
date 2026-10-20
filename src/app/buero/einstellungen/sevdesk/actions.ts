"use server";

import { requireRole } from "@/lib/auth";
import { sevdeskClient } from "@/lib/buchhaltung";
import { SevdeskFehler } from "@/lib/sevdesk-client";

export type SevdeskTest = { fehler?: string; konto?: { version: string; benutzer: string; kassen: number } };

/** Verbindung zu sevdesk prüfen (nur Admin): liest nur das Buchführungssystem, den ersten Benutzer und die Konten, ändert nichts. */
export async function sevdeskVerbindungTesten(): Promise<SevdeskTest> {
  await requireRole(["admin"]);
  const client = sevdeskClient();
  if (!client) return { fehler: "Es ist kein API-Token hinterlegt (SEVDESK_API_TOKEN)." };
  try {
    const r = await client.verbindungPruefen();
    return { konto: { version: r.version, benutzer: r.benutzerName, kassen: r.kassen } };
  } catch (fehler) {
    return { fehler: fehler instanceof SevdeskFehler ? fehler.message : "Die Verbindung hat nicht geklappt." };
  }
}
