import "server-only";
import { heuteIso } from "@/lib/datum";
import { naechsteKundennummer } from "@/lib/kundennummer";
import { createClient } from "@/lib/supabase/server";

/**
 * Nächste freie Kundennummer. Für jeden Ort gedacht, an dem ein neuer Kontakt entsteht
 * (Kontaktformular, später Angebot/Projekt). Berücksichtigt auch archivierte Kontakte.
 */
export async function kundennummerVorschlag(): Promise<string> {
  const supabase = await createClient();
  const nummern: (string | null)[] = [];
  for (let von = 0; von < 20_000; von += 1000) {
    const { data, error } = await supabase.from("contacts").select("kundennummer").order("id").range(von, von + 999);
    if (error) throw new Error("Die Kundennummern konnten nicht gelesen werden.");
    nummern.push(...data.map((k) => k.kundennummer));
    if (data.length < 1000) break;
  }
  return naechsteKundennummer(nummern, Number(heuteIso().slice(0, 4)));
}
