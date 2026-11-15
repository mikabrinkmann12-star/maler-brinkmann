"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { darf, requireRole } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { kontaktAnzeigename } from "@/lib/kontakt-schema";
import { createClient } from "@/lib/supabase/server";
import { zahlungenZuordnen, type OffeneAusgang, type OffeneEingang, type Vorschlag } from "@/lib/zahlungsabgleich";
import { rechnungAlsBezahltBuchen } from "../rechnungen/actions";

// Bankabgleich per Kontoauszug-Datei (Mika, 15.11.2026). Die Datei liest der Browser (src/lib/kontoauszug.ts), hierher kommen nur
// die Umsätze (Datum, Betrag, Name, IBAN, Zweck). Gespeichert wird davon nichts; bezahlt wird erst nach Bestätigung.
// Rechte: Eingangsrechnungen nur mit „eingangsrechnungen“, eigene Rechnungen nur mit „rechnungen“.

const tag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const umsatzSchema = z.object({
  datum: tag,
  betrag: z.number().finite().min(-10_000_000).max(10_000_000),
  name: z.string().max(300),
  iban: z.string().max(40),
  zweck: z.string().max(1000),
});

async function rechteLaden() {
  await requireRole(BUERO_ROLLEN);
  const [ausgang, eingang] = await Promise.all([darf("rechnungen"), darf("eingangsrechnungen")]);
  return { ausgang, eingang };
}

export async function zahlungenVorschlagen(eingabe: unknown): Promise<{ fehler?: string; vorschlaege?: Vorschlag[]; ohneZuordnung?: number }> {
  const rechte = await rechteLaden();
  if (!rechte.ausgang && !rechte.eingang) return { fehler: "Dafür fehlen dir die Rechte." };
  const p = z.array(umsatzSchema).max(5000).safeParse(eingabe);
  if (!p.success) return { fehler: "Die Umsätze konnten nicht gelesen werden." };

  const supabase = await createClient();
  const [eing, ausg] = await Promise.all([
    rechte.eingang
      ? supabase.from("incoming_invoices").select("id, lieferant, rechnungsnummer, rechnungsdatum, brutto, iban, gutschrift").eq("zahlstatus", "offen").is("archiviert_am", null).limit(2000)
      : Promise.resolve({ data: [], error: null }),
    rechte.ausgang
      ? supabase
          .from("invoices")
          .select("id, rechnungsnummer, rechnungsdatum, brutto, skonto_prozent, skonto_tage, art, contacts(firmenname, vorname, nachname)")
          .eq("status", "uebertragen")
          .eq("lexware_status", "open")
          .is("archiviert_am", null)
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eing.error || ausg.error) return { fehler: "Die offenen Rechnungen konnten nicht geladen werden." };

  const eingang: OffeneEingang[] = (eing.data ?? []).map((r) => ({
    id: r.id, lieferant: r.lieferant, rechnungsnummer: r.rechnungsnummer ?? "", rechnungsdatum: r.rechnungsdatum,
    brutto: r.brutto === null ? null : Number(r.brutto), iban: (r.iban ?? "").replace(/\s/g, "").toUpperCase(), gutschrift: r.gutschrift,
  }));
  const ausgang: OffeneAusgang[] = (ausg.data ?? [])
    .filter((r) => r.art !== "gutschrift" && r.art !== "storno" && r.rechnungsnummer && r.brutto !== null && r.rechnungsdatum)
    .map((r) => ({
      id: r.id, rechnungsnummer: r.rechnungsnummer!, kunde: r.contacts ? kontaktAnzeigename(r.contacts) : "", rechnungsdatum: r.rechnungsdatum!,
      brutto: Number(r.brutto), skontoProzent: r.skonto_prozent === null ? null : Number(r.skonto_prozent), skontoTage: r.skonto_tage,
    }));
  const vorschlaege = zahlungenZuordnen(p.data, eingang, ausgang);
  return { vorschlaege, ohneZuordnung: p.data.length - vorschlaege.length };
}

const buchungSchema = z.array(z.object({ art: z.enum(["eingang", "ausgang"]), id: z.uuid(), datum: tag })).min(1, "Bitte mindestens einen Vorschlag anhaken.").max(500);

/** Bestätigte Vorschläge als bezahlt buchen (mit dem Buchungstag als Zahlungsdatum). */
export async function zahlungenBuchen(eingabe: unknown): Promise<{ fehler?: string; gebucht?: number; fehlerListe?: string[] }> {
  const rechte = await rechteLaden();
  const p = buchungSchema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const supabase = await createClient();
  let gebucht = 0;
  const fehlerListe: string[] = [];
  for (const b of p.data) {
    if (b.datum > heuteIso()) { fehlerListe.push("Ein Buchungstag liegt in der Zukunft."); continue; }
    if (b.art === "ausgang") {
      if (!rechte.ausgang) { fehlerListe.push("Für Ausgangsrechnungen fehlen dir die Rechte."); continue; }
      const r = await rechnungAlsBezahltBuchen(b.id, b.datum);
      if (r.fehler) fehlerListe.push(r.fehler);
      else gebucht += 1;
    } else {
      if (!rechte.eingang) { fehlerListe.push("Für Eingangsrechnungen fehlen dir die Rechte."); continue; }
      const { data, error } = await supabase.from("incoming_invoices").update({ zahlstatus: "bezahlt", bezahlt_am: b.datum }).eq("id", b.id).eq("zahlstatus", "offen").select("id");
      if (error || !data?.length) fehlerListe.push("Eine Eingangsrechnung konnte nicht gebucht werden (vielleicht schon bezahlt).");
      else gebucht += 1;
    }
  }
  revalidatePath("/buero/eingangsrechnungen");
  revalidatePath("/buero/rechnungen");
  revalidatePath("/buero");
  return { gebucht, fehlerListe };
}
