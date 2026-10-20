"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBueroRecht } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { eingangDateiPruefen, eingangPfad, eingangsrechnungSchema } from "@/lib/eingangsrechnung";
import { eingangsrechnungAufnehmen } from "@/lib/eingangsrechnung-aufnahme";
import { imapKonfiguration } from "@/lib/env";
import { firmaLaden } from "@/lib/firma-daten";
import { postfachAbrufen, type AbrufErgebnis } from "@/lib/postfach-abruf";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// Eingangsrechnungen (nur Büro/Admin). Verbindlich regelt die Datenbank (RLS); die Prüfung hier gibt verständliche Meldungen.

export type EingangErgebnis = { fehler?: string };
export type AufnahmeAntwort = { fehler?: string; id?: string; doppelt?: boolean; lieferant?: string; zuPruefen?: boolean };

const aufnahmeSchema = z.object({
  id: z.uuid(),
  dateiname: z.string().trim().min(1, "Der Dateiname fehlt.").max(200, "Der Dateiname ist zu lang (höchstens 200 Zeichen)."),
  groesseBytes: z.number().int().positive(),
});

/** Nach dem Hochladen: Datei auslesen und die Rechnung anlegen. Zweimal senden legt nichts doppelt an. */
export async function eingangsrechnungAnlegen(eingabe: unknown): Promise<AufnahmeAntwort> {
  await requireBueroRecht("eingangsrechnungen");
  const p = aufnahmeSchema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const d = p.data;
  const art = eingangDateiPruefen(d.dateiname, d.groesseBytes);
  if (!art.ok) return { fehler: art.fehler };

  const supabase = await createClient();
  const { data: datei, error: ladefehler } = await supabase.storage.from("eingangsrechnungen").download(eingangPfad(d.id, art.endung));
  if (ladefehler || !datei) return { fehler: "Die Datei ist nicht angekommen. Bitte nochmal hochladen." };
  const bytes = new Uint8Array(await datei.arrayBuffer());

  const firma = await firmaLaden();
  const r = await eingangsrechnungAufnehmen(supabase, {
    id: d.id,
    endung: art.endung,
    dateiname: d.dateiname,
    typ: art.typ,
    bytes,
    quelle: "upload",
    eigeneNamen: [firma.name, "Brinkmann"].filter(Boolean),
  });
  if (!r.ok) return { fehler: r.fehler };
  revalidatePath("/buero/eingangsrechnungen");
  if (r.doppelt) return { id: r.id, doppelt: true, lieferant: r.lieferant };
  return { id: r.id, zuPruefen: r.zuPruefen };
}

/** Vorab prüfen, ob es diese Datei (SHA-256) schon gibt, damit sie gar nicht erst hochgeladen wird. */
export async function eingangsrechnungHashPruefen(hash: string): Promise<{ vorhanden: { id: string; lieferant: string } | null }> {
  await requireBueroRecht("eingangsrechnungen");
  if (!/^[0-9a-f]{64}$/.test(hash)) return { vorhanden: null };
  const supabase = await createClient();
  const { data } = await supabase.from("incoming_invoices").select("id, lieferant").eq("datei_hash", hash).is("archiviert_am", null).maybeSingle();
  return { vorhanden: data ? { id: data.id, lieferant: data.lieferant } : null };
}

/** Felder speichern. `bestaetigen` = als geprüft markieren (nimmt die Rechnung aus „Zu prüfen“). */
export async function eingangsrechnungSpeichern(id: string, eingabe: unknown, bestaetigen: boolean): Promise<EingangErgebnis> {
  await requireBueroRecht("eingangsrechnungen");
  if (!z.uuid().safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const p = eingangsrechnungSchema.safeParse(eingabe);
  if (!p.success) return { fehler: p.error.issues[0]?.message ?? "Ungültige Eingabe." };
  const d = p.data;
  if (d.zahlstatus === "bezahlt" && !d.bezahltAm) d.bezahltAm = heuteIso();
  if (d.zahlstatus === "offen") d.bezahltAm = null;
  if (bestaetigen && !d.lieferant) return { fehler: "Bitte den Lieferanten eintragen, bevor du die Rechnung als geprüft speicherst." };
  if (bestaetigen && d.brutto === null) return { fehler: "Bitte den Bruttobetrag eintragen, bevor du die Rechnung als geprüft speicherst." };

  const supabase = await createClient();
  const aenderung: Database["public"]["Tables"]["incoming_invoices"]["Update"] = {
    lieferant: d.lieferant,
    rechnungsnummer: d.rechnungsnummer || null,
    rechnungsdatum: d.rechnungsdatum,
    faellig_am: d.faelligAm,
    netto: d.netto,
    brutto: d.brutto,
    iban: d.iban || null,
    zahlstatus: d.zahlstatus,
    bezahlt_am: d.bezahltAm,
    project_id: d.projectId,
    bereich: d.projectId ? null : d.bereich,
    notiz: d.notiz || null,
  };
  if (bestaetigen) aenderung.zu_pruefen = false;
  const { data, error } = await supabase.from("incoming_invoices").update(aenderung).eq("id", id).select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt. Bitte Seite neu laden und nochmal versuchen." };
  revalidatePath("/buero/eingangsrechnungen");
  revalidatePath(`/buero/eingangsrechnungen/${id}`);
  return {};
}

/** Zahlstatus mit einem Klick umschalten (Pille in der Liste). */
export async function eingangsrechnungZahlstatus(id: string, bezahlt: boolean): Promise<EingangErgebnis> {
  await requireBueroRecht("eingangsrechnungen");
  if (!z.uuid().safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incoming_invoices")
    .update({ zahlstatus: bezahlt ? "bezahlt" : "offen", bezahlt_am: bezahlt ? heuteIso() : null })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { fehler: "Der Zahlstatus konnte nicht geändert werden." };
  revalidatePath("/buero/eingangsrechnungen");
  revalidatePath(`/buero/eingangsrechnungen/${id}`);
  return {};
}

/** Rechnung ins Archiv legen bzw. zurückholen. Nichts wird gelöscht. */
export async function eingangsrechnungArchivieren(id: string, archivieren: boolean): Promise<EingangErgebnis> {
  await requireBueroRecht("eingangsrechnungen");
  if (!z.uuid().safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incoming_invoices")
    .update({ archiviert_am: archivieren ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) {
    // Zurückholen kann an der „keine doppelte Datei“-Regel scheitern
    return { fehler: error.code === "23505" ? "Diese Datei gibt es schon als aktive Rechnung." : "Das hat nicht geklappt." };
  }
  if (!data?.length) return { fehler: "Das hat nicht geklappt." };
  revalidatePath("/buero/eingangsrechnungen");
  revalidatePath(`/buero/eingangsrechnungen/${id}`);
  return {};
}

/** Das Rechnungs-Postfach sofort abrufen (sonst läuft der Abruf einmal täglich von selbst). Büro und Admin. */
export async function postfachJetztAbrufen(): Promise<{ fehler?: string; ergebnis?: AbrufErgebnis }> {
  await requireBueroRecht("eingangsrechnungen");
  const konfig = imapKonfiguration();
  if (!konfig) return { fehler: "Das Postfach ist noch nicht eingerichtet (siehe Einstellungen → Postfach)." };
  const supabase = await createClient();
  const firma = await firmaLaden();
  const ergebnis = await postfachAbrufen(supabase, konfig, [firma.name, "Brinkmann"].filter(Boolean));
  revalidatePath("/buero/eingangsrechnungen");
  return { ergebnis };
}
