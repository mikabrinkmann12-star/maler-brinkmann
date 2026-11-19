"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { darf, requireBueroRecht } from "@/lib/auth";
import { kontaktSchema } from "@/lib/kontakt-schema";
import { kundennummerVorschlag } from "@/lib/kundennummer-daten";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { createClient } from "@/lib/supabase/server";

// Website-Anfragen: Büro/Admin mit dem Recht „buero_zugang“ (steht auch in den Regeln der Datenbank). Die Anfragen selbst kommen
// vom Webhook (/api/anfragen). Neue Kontakte zusätzlich nur mit „kontakte_bearbeiten“ (prüft auch die Datenbank).

export type AnfrageAktionErgebnis = { fehler?: string; kontaktId?: string };

function aktualisieren() {
  revalidatePath("/buero/anfragen");
  revalidatePath("/buero");
  revalidatePath("/buero/kontakte");
}

const FEHLER = "Das hat nicht geklappt. Bitte nochmal versuchen.";

/** Ablehnen: nur der Status (und optional eine Notiz), nichts wird gelöscht. Geht nur bei neuen Anfragen. */
export async function anfrageAblehnen(eingabe: unknown): Promise<AnfrageAktionErgebnis> {
  await requireBueroRecht("buero_zugang");
  const p = z
    .object({ id: z.uuid(), notiz: z.string().trim().max(1000, "Die Notiz ist zu lang (höchstens 1.000 Zeichen).").default("") })
    .safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("website_anfragen")
    .update({ status: "abgelehnt", notiz: p.data.notiz || null })
    .eq("id", p.data.id)
    .eq("status", "neu")
    .select("id");
  if (error) return { fehler: FEHLER };
  if (!data?.length) return { fehler: "Die Anfrage wurde schon bearbeitet. Bitte die Seite neu laden." };
  aktualisieren();
  return {};
}

const kontaktFelder = z.object({
  anrede: z.string().default(""),
  vorname: z.string().default(""),
  nachname: z.string().default(""),
  strasse: z.string().default(""),
  plz: z.string().default(""),
  ort: z.string().default(""),
  telefon: z.string().default(""),
  email: z.string().default(""),
  notizen: z.string().default(""),
});

const annehmenSchema = z.union([
  z.object({ id: z.uuid(), kontaktId: z.uuid("Ungültiger Kontakt.") }),
  z.object({ id: z.uuid(), kontakt: kontaktFelder }),
]);

/** Fehler der Datenbank-Funktion in verständliche Meldungen übersetzen. */
function meldung(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "Dafür fehlt dir das Recht.";
  if (error.code === "22023" || error.code === "P0002") return error.message;
  if (error.code === "23505") return "Diese Kundennummer gibt es schon. Bitte nochmal versuchen.";
  return FEHLER;
}

/**
 * Annehmen: neuen Kontakt anlegen (Typ privat, Kundennummer automatisch) oder einen vorhandenen verknüpfen; der Status wird
 * in derselben Datenbank-Transaktion gesetzt (`anfrage_annehmen`). Ein zweiter Klick legt nichts doppelt an.
 */
export async function anfrageAnnehmen(eingabe: unknown): Promise<AnfrageAktionErgebnis> {
  await requireBueroRecht("buero_zugang");
  const p = annehmenSchema.safeParse(eingabe);
  if (!p.success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();

  if ("kontaktId" in p.data) {
    const { data, error } = await supabase.rpc("anfrage_annehmen", { p_id: p.data.id, p_contact_id: p.data.kontaktId });
    if (error || !data) return { fehler: error ? meldung(error) : FEHLER };
    aktualisieren();
    return { kontaktId: data };
  }

  if (!(await darf("kontakte_bearbeiten"))) return { fehler: "Neue Kontakte darfst du nicht anlegen. Bitte einen vorhandenen verknüpfen." };

  // Kundennummer wird erst hier vergeben; trifft sie gleichzeitig eine andere Anlage, noch einmal mit der nächsten versuchen
  for (let versuch = 0; versuch < 2; versuch++) {
    let kundennummer: string;
    try {
      kundennummer = await kundennummerVorschlag();
    } catch {
      return { fehler: "Die Kundennummer konnte nicht berechnet werden." };
    }
    const k = kontaktSchema.safeParse({ ...p.data.kontakt, typ: "privat", kundennummer });
    if (!k.success) return { fehler: ersteMeldung(k.error) };
    const d = k.data;
    const { data, error } = await supabase.rpc("anfrage_annehmen", {
      p_id: p.data.id,
      p_kontakt: {
        kundennummer: d.kundennummer,
        anrede: d.anrede,
        vorname: d.vorname,
        nachname: d.nachname,
        strasse: d.strasse,
        plz: d.plz,
        ort: d.ort,
        telefon: d.telefon,
        email: d.email,
        notizen: d.notizen,
      },
    });
    if (error?.code === "23505" && versuch === 0) continue;
    if (error || !data) return { fehler: error ? meldung(error) : FEHLER };
    aktualisieren();
    return { kontaktId: data };
  }
  return { fehler: FEHLER };
}
