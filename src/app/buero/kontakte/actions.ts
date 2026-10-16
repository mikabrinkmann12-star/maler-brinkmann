"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { dublettenSchluessel, importStatus, type KontaktEntwurf } from "@/lib/kontakt-import";
import { importKontaktSchema, kontaktSchema } from "@/lib/kontakt-schema";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

export type KontaktErgebnis = { fehler?: string; id?: string };

const leerZuNull = (s: string) => (s === "" ? null : s);

function zeile(k: ReturnType<typeof kontaktSchema.parse> | ReturnType<typeof importKontaktSchema.parse>) {
  return {
    kundennummer: k.kundennummer,
    typ: k.typ,
    firmenname: leerZuNull(k.firmenname),
    anrede: leerZuNull(k.anrede),
    vorname: leerZuNull(k.vorname),
    nachname: leerZuNull(k.nachname),
    strasse: leerZuNull(k.strasse),
    plz: leerZuNull(k.plz),
    ort: leerZuNull(k.ort),
    ansprechpartner: leerZuNull(k.ansprechpartner),
    telefon: leerZuNull(k.telefon),
    mobil: leerZuNull(k.mobil),
    email: leerZuNull(k.email),
    website: leerZuNull(k.website),
    empfaenger: leerZuNull(k.empfaenger),
    notizen: leerZuNull(k.notizen),
    zahlungsziel_tage: k.zahlungsziel_tage,
    skonto_prozent: k.skonto_prozent,
    skonto_tage: k.skonto_tage,
    steuersatz: k.steuersatz,
  };
}

function aktualisieren(id?: string) {
  revalidatePath("/buero/kontakte");
  if (id) revalidatePath(`/buero/kontakte/${id}`);
}

/** Kontakt anlegen (id leer) oder ändern. Büro und Admin. */
export async function kontaktSpeichern(id: string | null, eingabe: unknown): Promise<KontaktErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (id !== null && !z.uuid().safeParse(id).success) return { fehler: "Ungültiger Kontakt." };
  const pruefung = kontaktSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };

  const supabase = await createClient();
  const felder = zeile(pruefung.data);
  const abfrage = id
    ? supabase.from("contacts").update(felder).eq("id", id)
    : supabase.from("contacts").insert(felder);
  const { data, error } = await abfrage.select("id");
  if (error) {
    return { fehler: error.code === "23505" ? "Diese Kundennummer gibt es schon bei einem anderen Kontakt." : "Speichern hat nicht geklappt. Bitte nochmal versuchen." };
  }
  if (!data?.length) return { fehler: "Kontakt nicht gefunden." };
  aktualisieren(data[0].id);
  return { id: data[0].id };
}

/** Archivieren / Wiederherstellen (nichts wird gelöscht). */
export async function kontaktArchivieren(id: string, archivieren: boolean): Promise<KontaktErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!z.uuid().safeParse(id).success) return { fehler: "Ungültiger Kontakt." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ archiviert_am: archivieren ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { fehler: "Das hat nicht geklappt." };
  aktualisieren(id);
  return {};
}

// ---------------------------------------------------------------------------
// Import (nur Admin). Importiert wird nur, was neu ist; Bestehendes wird nie überschrieben.
// ---------------------------------------------------------------------------
export type ImportErgebnis = {
  fehler?: string;
  importiert: number;
  uebersprungen: number;
  fehlerhaft: number;
};

const MAX_PRO_AUFRUF = 150;

export async function kontakteImportieren(eingabe: unknown): Promise<ImportErgebnis> {
  await requireRole(["admin"]);
  const leer = { importiert: 0, uebersprungen: 0, fehlerhaft: 0 };
  if (!Array.isArray(eingabe) || eingabe.length > MAX_PRO_AUFRUF) return { ...leer, fehler: "Zu viele Kontakte auf einmal." };

  const pruefungen = eingabe.map((e) => importKontaktSchema.safeParse(e));
  const gueltig = pruefungen.flatMap((p) => (p.success ? [p.data] : []));
  const fehlerhaft = pruefungen.length - gueltig.length;

  // Bestehende Kontakte laden (inkl. archivierter), um Dubletten nicht anzulegen
  const supabase = await createClient();
  const { data: bestehend, error: ladeFehler } = await supabase
    .from("contacts")
    .select("kundennummer, firmenname, vorname, nachname, strasse, plz");
  if (ladeFehler) return { ...leer, fehler: "Die vorhandenen Kontakte konnten nicht gelesen werden." };

  const status = importStatus(
    gueltig.map((k, i) => ({ zeile: i, entwurf: k as unknown as KontaktEntwurf })),
    {
      kundennummern: new Set(bestehend.map((b) => b.kundennummer).filter((n): n is string => Boolean(n))),
      schluessel: new Set(
        bestehend.map((b) =>
          dublettenSchluessel({ firmenname: b.firmenname ?? "", vorname: b.vorname ?? "", nachname: b.nachname ?? "", strasse: b.strasse ?? "", plz: b.plz ?? "" }),
        ),
      ),
    },
  );
  const neue = gueltig.filter((_, i) => status[i] === "neu");

  let importiert = 0;
  if (neue.length) {
    const { error } = await supabase.from("contacts").insert(neue.map(zeile));
    if (!error) importiert = neue.length;
    else {
      // Bei einem Konflikt einzeln versuchen, damit der Rest trotzdem ankommt
      for (const k of neue) {
        const einzeln = await supabase.from("contacts").insert(zeile(k));
        if (!einzeln.error) importiert++;
      }
    }
  }
  aktualisieren();
  return { importiert, uebersprungen: gueltig.length - neue.length + (neue.length - importiert), fehlerhaft };
}
