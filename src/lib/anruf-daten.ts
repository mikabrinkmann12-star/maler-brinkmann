import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nummernSchluessel, type NeuerAnruf } from "@/lib/anruf";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

/** Kontakt zur Rufnummer des Anrufers: vergleicht die letzten 9 Ziffern von Telefon und Mobil, nur bei genau einem Treffer. */
export async function kontaktZuNummer(db: Db, nummer: string | null): Promise<string | null> {
  const schluessel = nummernSchluessel(nummer);
  if (!schluessel) return null;
  const { data } = await db.from("contacts").select("id, telefon, mobil").is("archiviert_am", null).or("telefon.not.is.null,mobil.not.is.null").limit(2000);
  const treffer = (data ?? []).filter((k) => nummernSchluessel(k.telefon) === schluessel || nummernSchluessel(k.mobil) === schluessel);
  return treffer.length === 1 ? treffer[0].id : null;
}

export type AnrufErgebnis = { id: string; doppelt: boolean };

/** Legt den Anruf an. Ein zweites Senden desselben Anrufs (gleiche Anbieter-ID) legt nichts doppelt an. Nur mit dem Dienst-Client aufrufen (Webhook). */
export async function anrufSpeichern(db: Db, a: NeuerAnruf): Promise<AnrufErgebnis> {
  if (a.anbieterId) {
    const { data: vorhanden } = await db.from("calls").select("id").eq("anbieter", a.anbieter).eq("anbieter_id", a.anbieterId).maybeSingle();
    if (vorhanden) return { id: vorhanden.id, doppelt: true };
  }
  const contactId = await kontaktZuNummer(db, a.richtung === "eingehend" ? a.vonNummer : a.anNummer);
  const { data, error } = await db
    .from("calls")
    .insert({
      anbieter: a.anbieter,
      anbieter_id: a.anbieterId,
      richtung: a.richtung,
      von_nummer: a.vonNummer,
      an_nummer: a.anNummer,
      contact_id: contactId,
      beginn: a.beginn,
      dauer_sek: a.dauerSek,
      zusammenfassung: a.zusammenfassung,
      transkript: a.transkript,
      aufnahme_url: a.aufnahmeUrl,
      kategorie: a.kategorie,
      erstellt_von: null,
    })
    .select("id")
    .single();
  if (error) {
    // Zwei gleichzeitige Sendungen: die zweite trifft den eindeutigen Index
    if (error.code === "23505" && a.anbieterId) {
      const { data: vorhanden } = await db.from("calls").select("id").eq("anbieter", a.anbieter).eq("anbieter_id", a.anbieterId).maybeSingle();
      if (vorhanden) return { id: vorhanden.id, doppelt: true };
    }
    throw new Error(error.message);
  }
  return { id: data.id, doppelt: false };
}
