"use server";

import { revalidatePath } from "next/cache";
import { requireBueroRecht } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type DatevZustand = { fehler?: string; gespeichert?: number };

const feld = (f: FormData, n: string): string => String(f.get(n) ?? "").trim();

/** Zahl von 1 bis max (nur Ziffern) oder Fehlertext. */
function konto(f: FormData, name: string, label: string, min = 1, max = 99_999_999): number | string {
  const t = feld(f, name);
  if (!/^\d+$/.test(t)) return `${label}: bitte nur Ziffern eingeben.`;
  const n = Number(t);
  return n < min || n > max ? `${label}: bitte eine Zahl von ${min} bis ${max} eingeben.` : n;
}

/** Konten und Nummern für den DATEV-Export speichern (wer die Firmeneinstellungen ändern darf). Der Steuerberater nennt sie. */
export async function datevSpeichern(_vorher: DatevZustand, formData: FormData): Promise<DatevZustand> {
  const nutzer = await requireBueroRecht("einstellungen_firma");
  const werte = {
    berater: konto(formData, "berater", "Beraternummer", 0, 9_999_999),
    mandant: konto(formData, "mandant", "Mandantennummer", 0, 99_999),
    debitor: konto(formData, "debitor", "Sammeldebitor"),
    erloes19: konto(formData, "erloes19", "Erlöse 19 %"),
    erloes7: konto(formData, "erloes7", "Erlöse 7 %"),
    erloes0: konto(formData, "erloes0", "Erlöse 0 %"),
    erloes_reverse_charge: konto(formData, "erloes_reverse_charge", "Erlöse § 13b"),
    abschlag19: konto(formData, "abschlag19", "Abschlagsrechnungen 19 %"),
    abschlag_reverse_charge: konto(formData, "abschlag_reverse_charge", "Abschlagsrechnungen § 13b"),
    schluss: konto(formData, "schluss", "Schlussrechnungen"),
    sachkontenlaenge: konto(formData, "sachkontenlaenge", "Sachkontenlänge", 4, 8),
  };
  for (const w of Object.values(werte)) if (typeof w === "string") return { fehler: w };
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({ schluessel: "datev", wert: werte, updated_by: nutzer.id });
  if (error) return { fehler: "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  revalidatePath("/buero/rechnungen/steuerberater");
  return { gespeichert: Date.now() };
}
