"use server";

import { revalidatePath } from "next/cache";
import { requireBueroRecht } from "@/lib/auth";
import { PROJEKT_START_STANDARD, laufendeNummer } from "@/lib/projektnummer";
import { GUTSCHRIFT_PRAEFIX_STANDARD, RECHNUNG_PRAEFIX_STANDARD, praefixGueltig } from "@/lib/rechnung-eigen";
import { createClient } from "@/lib/supabase/server";

export type NummernkreisZustand = { fehler?: string; gespeichert?: number };

/**
 * Nummernkreise speichern (nur wer „Firmendaten & Einstellungen“ darf): Startwert der Projektnummern („602“ oder „P-(2400)602“; leer = Standard)
 * sowie Kürzel („R-“) und Startnummer der Rechnungen. Die Startnummer gilt nur für die erste Rechnung eines Jahres; danach zählt die Datenbank weiter.
 */
export async function nummernkreisSpeichern(_vorher: NummernkreisZustand, formData: FormData): Promise<NummernkreisZustand> {
  const admin = await requireBueroRecht("einstellungen_firma");
  const roh = String(formData.get("projekt_start") ?? "").trim();
  const nummer = roh === "" ? PROJEKT_START_STANDARD : laufendeNummer(roh);
  if (nummer === null) return { fehler: "Bitte die Nummer eingeben, z. B. 602 oder P-(2400)602." };

  const praefix = String(formData.get("rechnung_praefix") ?? "").trim() || RECHNUNG_PRAEFIX_STANDARD;
  if (!praefixGueltig(praefix)) return { fehler: "Das Rechnungs-Kürzel darf höchstens 10 Zeichen haben (Buchstaben, Ziffern, - / . und Klammern, keine Leerzeichen)." };
  const startRoh = String(formData.get("rechnung_start") ?? "").trim();
  const rechnungStart = startRoh === "" ? 1 : Number(startRoh);
  if (!Number.isInteger(rechnungStart) || rechnungStart < 1 || rechnungStart > 99999) return { fehler: "Die Startnummer der Rechnungen muss eine ganze Zahl von 1 bis 99999 sein." };

  const gPraefix = String(formData.get("gutschrift_praefix") ?? "").trim() || GUTSCHRIFT_PRAEFIX_STANDARD;
  if (!praefixGueltig(gPraefix)) return { fehler: "Das Gutschrift-Kürzel darf höchstens 10 Zeichen haben (Buchstaben, Ziffern, - / . und Klammern, keine Leerzeichen)." };
  if (gPraefix === praefix) return { fehler: "Rechnungen und Gutschriften brauchen verschiedene Kürzel, sonst könnten Nummern doppelt vorkommen." };
  const gStartRoh = String(formData.get("gutschrift_start") ?? "").trim();
  const gutschriftStart = gStartRoh === "" ? 1 : Number(gStartRoh);
  if (!Number.isInteger(gutschriftStart) || gutschriftStart < 1 || gutschriftStart > 99999) return { fehler: "Die Startnummer der Gutschriften muss eine ganze Zahl von 1 bis 99999 sein." };

  const supabase = await createClient();
  // Bestehende Werte bleiben erhalten (der Eintrag enthält mehrere Schlüssel)
  const { data: vorhanden } = await supabase.from("app_settings").select("wert").eq("schluessel", "nummernkreise").maybeSingle();
  const alt = vorhanden?.wert && typeof vorhanden.wert === "object" && !Array.isArray(vorhanden.wert) ? vorhanden.wert : {};
  const { error } = await supabase
    .from("app_settings")
    .upsert({ schluessel: "nummernkreise", wert: { ...alt, projekt_start: nummer, rechnung_praefix: praefix, rechnung_start: rechnungStart, gutschrift_praefix: gPraefix, gutschrift_start: gutschriftStart }, updated_by: admin.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  revalidatePath("/buero/einstellungen/nummernkreise");
  revalidatePath("/buero/projekte", "layout");
  return { gespeichert: Date.now() };
}
