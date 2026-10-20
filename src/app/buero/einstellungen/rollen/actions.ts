"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { stufeErlaubt, type Stufe } from "@/lib/rechte";
import { createClient } from "@/lib/supabase/server";

// Rechte der Rollen Büro und Mitarbeiter ändern. NUR der Admin (fest, nicht delegierbar, sonst könnte sich jemand selbst mehr Rechte geben).
// Die Datenbank erlaubt das Ändern der Tabelle `role_permissions` ebenfalls nur dem Admin; jede Änderung steht im Protokoll (audit_log).

export type RechteErgebnis = { fehler?: string; geaendert?: number };

const aenderungSchema = z.object({
  rolle: z.enum(["buero", "mitarbeiter"]),
  recht: z.string().min(1).max(60),
  stufe: z.enum(["nein", "eigene", "ja"]),
});
const eingabeSchema = z.array(aenderungSchema).min(1, "Es gibt nichts zu speichern.").max(200);

export async function rechteSpeichern(eingabe: unknown): Promise<RechteErgebnis> {
  const admin = await requireRole(["admin"]);
  const p = eingabeSchema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Die Eingabe ist ungültig." };

  // Jede Stufe muss für die Rolle und das Recht erlaubt sein (z. B. kein „ja“ für Mitarbeiter bei Büro-Funktionen)
  for (const a of p.data) {
    if (!stufeErlaubt(a.rolle, a.recht, a.stufe)) return { fehler: "Diese Einstellung ist nicht erlaubt. Bitte die Seite neu laden." };
  }
  const zeilen = p.data.map((a) => ({ rolle: a.rolle, recht: a.recht, stufe: a.stufe as Stufe, updated_by: admin.id }));
  const supabase = await createClient();
  const { error } = await supabase.from("role_permissions").upsert(zeilen, { onConflict: "rolle,recht" });
  if (error) return { fehler: "Das hat nicht geklappt. Bitte nochmal versuchen." };

  // Alles, was von den Rechten abhängt, neu laden (Menüs, Listen, beide Ansichten)
  revalidatePath("/", "layout");
  return { geaendert: zeilen.length };
}
