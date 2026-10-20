import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rechnungMitKiLesen, kiRechnungKonfiguration } from "@/lib/eingangsrechnung-ki";
import { rechnungAuslesen } from "@/lib/eingangsrechnung-lesen";
import { eingangPfad } from "@/lib/eingangsrechnung";
import type { Database } from "@/lib/supabase/database.types";

// Legt aus einer bereits im Speicher liegenden Datei eine Eingangsrechnung an (Upload im Büro oder E-Mail-Eingang).
// Der Aufrufer hat vorher die Rolle geprüft (Büro/Admin) bzw. ist der Postfach-Abruf mit eigenem Geheimnis.

export type AufnahmeErgebnis =
  | { ok: true; id: string; zuPruefen: boolean; erkanntAus: string; doppelt: false }
  | { ok: true; id: string; doppelt: true; lieferant: string }
  | { ok: false; fehler: string };

export function dateiHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Namen, die als Lieferant in Frage kommen: Firmen aus den Kontakten und früher erfasste Lieferanten. */
export async function bekannteLieferanten(supabase: SupabaseClient<Database>): Promise<string[]> {
  const [{ data: kontakte }, { data: rechnungen }] = await Promise.all([
    supabase.from("contacts").select("firmenname").not("firmenname", "is", null).limit(3000),
    supabase.from("incoming_invoices").select("lieferant").neq("lieferant", "").limit(2000),
  ]);
  const namen = new Set<string>();
  for (const k of kontakte ?? []) if (k.firmenname) namen.add(k.firmenname.trim());
  for (const r of rechnungen ?? []) namen.add(r.lieferant.trim());
  return [...namen].filter((n) => n.length >= 4);
}

export async function eingangsrechnungAufnehmen(
  supabase: SupabaseClient<Database>,
  eingabe: {
    id: string;
    endung: string;
    dateiname: string;
    typ: string;
    bytes: Uint8Array;
    quelle: "upload" | "email";
    absender?: string;
    eigeneNamen: string[];
  },
): Promise<AufnahmeErgebnis> {
  const hash = dateiHash(eingabe.bytes);

  // Dieselbe Datei nicht zweimal anlegen
  const { data: vorhanden } = await supabase
    .from("incoming_invoices")
    .select("id, lieferant")
    .eq("datei_hash", hash)
    .is("archiviert_am", null)
    .maybeSingle();
  if (vorhanden) return { ok: true, id: vorhanden.id, doppelt: true, lieferant: vorhanden.lieferant };

  const bekannte = await bekannteLieferanten(supabase);
  // Die KI wird nur gefragt, wenn sie ausdrücklich eingeschaltet ist (KI_RECHNUNG_AKTIV=1 und Schlüssel); sonst geht nichts an einen Dienst
  const kiLeser = kiRechnungKonfiguration().aktiv ? rechnungMitKiLesen : undefined;
  const auslese = await rechnungAuslesen(eingabe.bytes, eingabe.endung, bekannte, eingabe.eigeneNamen, kiLeser);

  // Lieferant aus den Kontakten verknüpfen, wenn der Name genau passt
  let contactId: string | null = null;
  if (auslese.lieferant) {
    const { data: kontakt } = await supabase.from("contacts").select("id").ilike("firmenname", auslese.lieferant.replace(/[%_]/g, "")).limit(1).maybeSingle();
    contactId = kontakt?.id ?? null;
  }

  const { error } = await supabase.from("incoming_invoices").insert({
    id: eingabe.id,
    lieferant: auslese.lieferant,
    contact_id: contactId,
    rechnungsnummer: auslese.rechnungsnummer || null,
    rechnungsdatum: auslese.rechnungsdatum,
    faellig_am: auslese.faelligAm,
    netto: auslese.netto,
    brutto: auslese.brutto,
    iban: auslese.iban || null,
    zu_pruefen: auslese.zuPruefen,
    storage_pfad: eingangPfad(eingabe.id, eingabe.endung),
    dateiname: eingabe.dateiname.slice(0, 200),
    mime: eingabe.typ,
    groesse_bytes: eingabe.bytes.length,
    datei_hash: hash,
    quelle: eingabe.quelle,
    absender: eingabe.absender?.slice(0, 300) ?? null,
    erkannt_aus: auslese.erkanntAus,
  });
  if (error) {
    // Dieselbe ID noch einmal gesendet (Netz-Wiederholung): schon angelegt, nichts doppelt
    if (error.code === "23505" && error.message.includes("incoming_invoices_pkey")) {
      return { ok: true, id: eingabe.id, zuPruefen: auslese.zuPruefen, erkanntAus: auslese.erkanntAus, doppelt: false };
    }
    if (error.code === "23505") return { ok: false, fehler: "Diese Datei gibt es schon als Eingangsrechnung." };
    return { ok: false, fehler: "Die Rechnung konnte nicht gespeichert werden." };
  }
  return { ok: true, id: eingabe.id, zuPruefen: auslese.zuPruefen, erkanntAus: auslese.erkanntAus, doppelt: false };
}
