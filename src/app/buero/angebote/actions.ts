"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { istAngebotStatus, type AngebotStatus } from "@/lib/angebot";
import {
  abschlussSchema,
  bausteinPruefen,
  kopfSchema,
  neuesAngebotSchema,
  steuerAusAuswahl,
  type BausteinEingabe,
} from "@/lib/angebot-schema";
import { angebotEinstellungenLaden } from "@/lib/firma-daten";
import { heuteIso } from "@/lib/datum";
import { istKatalogArt } from "@/lib/katalog";
import { briefanschrift } from "@/lib/kontakt-schema";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { adresseText } from "@/lib/projekt";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";

// Angebote bearbeiten (Büro und Admin). Verbindlich regeln RLS und Trigger der Datenbank die Rechte
// und die Sperre nach dem Versand; die Aktionen übersetzen deren Fehler in verständliche Meldungen.

export type AngebotErgebnis = { fehler?: string; id?: string };

const uuid = z.uuid();

function dbMeldung(fehler: { code?: string; message: string }): string {
  if (fehler.code === "P0001") return fehler.message; // Meldungen der Trigger sind schon deutsch
  if (fehler.code === "23514") return "Ein Wert ist ungültig (zu lang oder außerhalb des erlaubten Bereichs).";
  return "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

function aktualisieren(id?: string) {
  revalidatePath("/buero/angebote", "layout");
  if (id) revalidatePath(`/buero/angebote/${id}`);
}

// ---------------------------------------------------------------------------
// Angebot anlegen, Kopf, Abschluss
// ---------------------------------------------------------------------------

/**
 * Neues Angebot für ein Projekt. Vorbelegt aus Projekt, Kunde und den Vorgaben der Einstellungen:
 * Leistungsort = Baustellen-Adresse, Empfänger = Briefanschrift des Kunden, Steuer = Steuersatz des Kunden
 * (0 % beim Kunden bedeutet Reverse-Charge), Texte und Rabatt aus „Angebote – Vorgaben“.
 */
export async function angebotAnlegen(projektId: string, eingabe: unknown): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(projektId).success) return { fehler: "Ungültiges Projekt." };
  const pruefung = neuesAngebotSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };

  const supabase = await createClient();
  const { data: projekt } = await supabase
    .from("projects")
    .select(
      "id, archiviert_am, baustelle_strasse, baustelle_plz, baustelle_ort, contacts(typ, anrede, firmenname, ansprechpartner, vorname, nachname, strasse, plz, ort, empfaenger, steuersatz)",
    )
    .eq("id", projektId)
    .maybeSingle();
  if (!projekt) return { fehler: "Projekt nicht gefunden." };
  if (projekt.archiviert_am) return { fehler: "Für ein archiviertes Projekt kann kein Angebot angelegt werden." };

  const vorgaben = await angebotEinstellungenLaden();
  const kunde = projekt.contacts;
  const kundenSatz = kunde ? Number(kunde.steuersatz) : vorgaben.standard_steuersatz;
  const reverseCharge = kunde != null && kundenSatz === 0;
  const steuersatz = reverseCharge ? 0 : kundenSatz;

  const leistungsort = pruefung.data.leistungsort
    || adresseText({ strasse: projekt.baustelle_strasse, plz: projekt.baustelle_plz, ort: projekt.baustelle_ort });

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      project_id: projektId,
      betreff: pruefung.data.betreff,
      leistungsort: leistungsort || null,
      datum: heuteIso(),
      empfaenger: kunde ? briefanschrift(kunde).join("\n") || null : null,
      einleitung: vorgaben.einleitung || null,
      schlusstext: vorgaben.schlusstext || null,
      steuersatz,
      reverse_charge: reverseCharge,
      rabatt_prozent: vorgaben.standard_rabatt,
    })
    .select("id")
    .single();
  if (error) return { fehler: dbMeldung(error) };

  aktualisieren();
  revalidatePath(`/baustellen/${projektId}`);
  return { id: data.id };
}

export async function angebotKopfSpeichern(id: string, eingabe: unknown): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültiges Angebot." };
  const pruefung = kopfSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const k = pruefung.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({
      betreff: k.betreff,
      leistungsort: k.leistungsort || null,
      datum: k.datum,
      empfaenger: k.empfaenger || null,
      einleitung: k.einleitung || null,
    })
    .eq("id", id)
    .select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Angebot nicht gefunden." };
  aktualisieren(id);
  return { id };
}

export async function angebotAbschlussSpeichern(id: string, eingabe: unknown): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültiges Angebot." };
  const pruefung = abschlussSchema.safeParse(eingabe);
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const a = pruefung.data;
  const steuer = steuerAusAuswahl(a.steuer);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({
      schlusstext: a.schlusstext || null,
      steuersatz: steuer.steuersatz,
      reverse_charge: steuer.reverseCharge,
      rabatt_prozent: a.rabatt,
    })
    .eq("id", id)
    .select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Angebot nicht gefunden." };
  aktualisieren(id);
  return { id };
}

// ---------------------------------------------------------------------------
// Status, Archiv, Kopie
// ---------------------------------------------------------------------------

export async function angebotStatusSetzen(id: string, status: string): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(id).success || !istAngebotStatus(status)) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();

  if (status === "versendet") {
    // Ein leeres Angebot wird nicht „versendet“.
    const { count } = await supabase
      .from("quote_items")
      .select("id", { count: "exact", head: true })
      .eq("quote_id", id)
      .eq("typ", "position");
    if (!count) return { fehler: "Das Angebot hat noch keine Position." };
  }
  const { data, error } = await supabase.from("quotes").update({ status: status as AngebotStatus }).eq("id", id).select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Angebot nicht gefunden." };
  aktualisieren(id);
  return { id };
}

export async function angebotArchivieren(id: string, archivieren: boolean): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültiges Angebot." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotes")
    .update({ archiviert_am: archivieren ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Angebot nicht gefunden." };
  aktualisieren(id);
  return { id };
}

/** Angebot kopieren: neuer Entwurf im selben Projekt mit allen Bausteinen, Datum heute. */
export async function angebotKopieren(id: string): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(id).success) return { fehler: "Ungültiges Angebot." };
  const supabase = await createClient();

  const { data: alt } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
  if (!alt) return { fehler: "Angebot nicht gefunden." };
  const { data: items, error: itemsFehler } = await supabase
    .from("quote_items")
    .select("sortierung, typ, kurztext, langtext, menge, einheit, einzelpreis, bild_pfad, material_id, service_id")
    .eq("quote_id", id)
    .order("sortierung");
  if (itemsFehler) return { fehler: "Die Bausteine konnten nicht gelesen werden." };

  const { data: neu, error } = await supabase
    .from("quotes")
    .insert({
      project_id: alt.project_id,
      betreff: alt.betreff.length > 190 ? alt.betreff.slice(0, 190) : `${alt.betreff} (Kopie)`,
      leistungsort: alt.leistungsort,
      datum: heuteIso(),
      empfaenger: alt.empfaenger,
      einleitung: alt.einleitung,
      schlusstext: alt.schlusstext,
      steuersatz: alt.steuersatz,
      reverse_charge: alt.reverse_charge,
      rabatt_prozent: alt.rabatt_prozent,
    })
    .select("id")
    .single();
  if (error) return { fehler: dbMeldung(error) };

  // Bilder gehören zu einem Angebot (Pfad beginnt mit der Angebots-ID): in den neuen Ordner kopieren.
  const bausteine = [];
  for (const i of items) {
    let bildPfad: string | null = null;
    if (i.bild_pfad) {
      const datei = i.bild_pfad.split("/").slice(1).join("/");
      bildPfad = `${neu.id}/${datei}`;
      const { error: kopierFehler } = await supabase.storage.from("angebotsbilder").copy(i.bild_pfad, bildPfad);
      if (kopierFehler) bildPfad = null;
    }
    if (i.typ === "bild" && !bildPfad) continue; // Bild ließ sich nicht kopieren: Baustein weglassen
    bausteine.push({ ...i, quote_id: neu.id, bild_pfad: bildPfad });
  }
  if (bausteine.length) {
    const { error: einfuegen } = await supabase.from("quote_items").insert(bausteine);
    if (einfuegen) return { fehler: "Die Kopie wurde angelegt, aber nicht alle Bausteine ließen sich kopieren." , id: neu.id };
  }
  aktualisieren();
  return { id: neu.id };
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

async function naechsteSortierung(angebotId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quote_items")
    .select("sortierung")
    .eq("quote_id", angebotId)
    .order("sortierung", { ascending: false })
    .limit(1);
  return (data?.[0]?.sortierung ?? -1) + 1;
}

/**
 * Baustein anlegen (`id` leer, ans Ende, oder hinter den Baustein `nachId`) oder ändern.
 */
export async function bausteinSpeichern(
  angebotId: string,
  id: string | null,
  eingabe: BausteinEingabe,
  nachId?: string | null,
): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(angebotId).success || (id !== null && !uuid.safeParse(id).success)) return { fehler: "Ungültige Eingabe." };
  const pruefung = bausteinPruefen(eingabe);
  if ("fehler" in pruefung) return { fehler: pruefung.fehler };
  const d = pruefung.daten;
  const felder = { typ: d.typ, kurztext: d.kurztext, langtext: d.langtext, menge: d.menge, einheit: d.einheit, einzelpreis: d.einzelpreis };

  const supabase = await createClient();
  if (id) {
    // Art und Bild ändern sich beim Bearbeiten nicht
    const { typ: _typ, ...ohneTyp } = felder;
    void _typ;
    const { data, error } = await supabase.from("quote_items").update(ohneTyp).eq("id", id).eq("quote_id", angebotId).select("id");
    if (error) return { fehler: dbMeldung(error) };
    if (!data?.length) return { fehler: "Baustein nicht gefunden." };
    aktualisieren(angebotId);
    return { id };
  }

  const { data, error } = await supabase
    .from("quote_items")
    .insert({ ...felder, quote_id: angebotId, sortierung: await naechsteSortierung(angebotId) })
    .select("id")
    .single();
  if (error) return { fehler: dbMeldung(error) };
  if (nachId) await bausteinNach(angebotId, data.id, nachId);
  aktualisieren(angebotId);
  return { id: data.id };
}

/** Baustein `id` direkt hinter den Baustein `nachId` setzen (alle Positionen werden neu durchgezählt). */
async function bausteinNach(angebotId: string, id: string, nachId: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("quote_items").select("id").eq("quote_id", angebotId).order("sortierung").order("created_at");
  if (!data) return;
  const reihenfolge = data.map((z) => z.id).filter((x) => x !== id);
  const stelle = reihenfolge.indexOf(nachId);
  if (stelle < 0) return;
  reihenfolge.splice(stelle + 1, 0, id);
  await sortierungSetzen(angebotId, reihenfolge);
}

async function sortierungSetzen(angebotId: string, reihenfolge: string[]): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("quote_items").select("id, sortierung").eq("quote_id", angebotId);
  const alt = new Map((data ?? []).map((z) => [z.id, z.sortierung]));
  for (const [stelle, bausteinId] of reihenfolge.entries()) {
    if (alt.get(bausteinId) !== stelle) await supabase.from("quote_items").update({ sortierung: stelle }).eq("id", bausteinId);
  }
}

export async function bausteinLoeschen(angebotId: string, id: string): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(angebotId).success || !uuid.safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("quote_items").delete().eq("id", id).eq("quote_id", angebotId).select("id");
  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Baustein nicht gefunden." };
  aktualisieren(angebotId);
  return { id };
}

export async function bausteinVerschieben(angebotId: string, id: string, richtung: "hoch" | "runter"): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(angebotId).success || !uuid.safeParse(id).success) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();

  const { data: quote } = await supabase.from("quotes").select("status").eq("id", angebotId).maybeSingle();
  if (!quote) return { fehler: "Angebot nicht gefunden." };
  if (quote.status !== "entwurf") return { fehler: "Dieses Angebot wurde schon versendet und ist gesperrt. Setze es zuerst zurück auf Entwurf." };

  const { data } = await supabase.from("quote_items").select("id").eq("quote_id", angebotId).order("sortierung").order("created_at");
  const ids = (data ?? []).map((z) => z.id);
  const stelle = ids.indexOf(id);
  const ziel = richtung === "hoch" ? stelle - 1 : stelle + 1;
  if (stelle < 0) return { fehler: "Baustein nicht gefunden." };
  if (ziel < 0 || ziel >= ids.length) return { id };
  [ids[stelle], ids[ziel]] = [ids[ziel], ids[stelle]];
  await sortierungSetzen(angebotId, ids);
  aktualisieren(angebotId);
  return { id };
}

// ---------------------------------------------------------------------------
// Katalog → Position
// ---------------------------------------------------------------------------

export type KatalogTreffer = {
  id: string;
  name: string;
  nummer: string;
  einheit: string;
  vk: number;
  ordner: string;
};

/** Katalog durchsuchen (für „Aus Katalog“). Höchstens 25 Treffer, Preise sind die Verkaufspreise. */
export async function katalogSuchen(art: string, q: string): Promise<{ fehler?: string; treffer?: KatalogTreffer[] }> {
  await requireRole(BUERO_ROLLEN);
  if (!istKatalogArt(art)) return { fehler: "Ungültige Art." };
  const suche = suchtext(q);
  const supabase = await createClient();

  if (art === "material") {
    let abfrage = supabase.from("materials").select("id, name, artikelnr, einheit, vk, lieferant, catalog_folders(name)").is("archiviert_am", null);
    if (suche) abfrage = abfrage.or(["name", "artikelnr", "lieferant", "beschreibung"].map((f) => `${f}.ilike.%${suche}%`).join(","));
    const { data, error } = await abfrage.order("name").limit(25);
    if (error) return { fehler: "Die Suche hat nicht geklappt." };
    return {
      treffer: data.map((m) => ({
        id: m.id, name: m.name, nummer: m.artikelnr ?? "", einheit: m.einheit, vk: Number(m.vk),
        ordner: [m.catalog_folders?.name, m.lieferant].filter(Boolean).join(" · "),
      })),
    };
  }
  let abfrage = supabase.from("services").select("id, name, nummer, einheit, vk, catalog_folders(name)").is("archiviert_am", null);
  if (suche) abfrage = abfrage.or(["name", "nummer", "langtext"].map((f) => `${f}.ilike.%${suche}%`).join(","));
  const { data, error } = await abfrage.order("name").limit(25);
  if (error) return { fehler: "Die Suche hat nicht geklappt." };
  return {
    treffer: data.map((s) => ({
      id: s.id, name: s.name, nummer: s.nummer ?? "", einheit: s.einheit, vk: Number(s.vk), ordner: s.catalog_folders?.name ?? "",
    })),
  };
}

/** Katalogeintrag als Position ins Angebot kopieren (Menge 1, Preis = Verkaufspreis; beides im Angebot änderbar). */
export async function positionAusKatalog(angebotId: string, art: string, katalogId: string, nachId?: string | null): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(angebotId).success || !uuid.safeParse(katalogId).success || !istKatalogArt(art)) return { fehler: "Ungültige Eingabe." };
  const supabase = await createClient();

  let felder: { kurztext: string; langtext: string | null; einheit: string; einzelpreis: number; material_id: string | null; service_id: string | null };
  if (art === "material") {
    const { data } = await supabase.from("materials").select("id, name, beschreibung, einheit, vk").eq("id", katalogId).maybeSingle();
    if (!data) return { fehler: "Material nicht gefunden." };
    felder = { kurztext: data.name, langtext: data.beschreibung || null, einheit: data.einheit, einzelpreis: Number(data.vk), material_id: data.id, service_id: null };
  } else {
    const { data } = await supabase.from("services").select("id, name, langtext, einheit, vk").eq("id", katalogId).maybeSingle();
    if (!data) return { fehler: "Leistung nicht gefunden." };
    felder = { kurztext: data.name, langtext: data.langtext || null, einheit: data.einheit, einzelpreis: Number(data.vk), material_id: null, service_id: data.id };
  }

  const { data, error } = await supabase
    .from("quote_items")
    .insert({ ...felder, quote_id: angebotId, typ: "position", menge: 1, sortierung: await naechsteSortierung(angebotId) })
    .select("id")
    .single();
  if (error) return { fehler: dbMeldung(error) };
  if (nachId) await bausteinNach(angebotId, data.id, nachId);
  aktualisieren(angebotId);
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// Bild
// ---------------------------------------------------------------------------

/** Nach dem Hochladen (aus dem Browser in den Bucket „angebotsbilder“) den Bild-Baustein anlegen. */
export async function bildBausteinAnlegen(angebotId: string, pfad: string, unterschrift: string, nachId?: string | null): Promise<AngebotErgebnis> {
  await requireRole(BUERO_ROLLEN);
  if (!uuid.safeParse(angebotId).success) return { fehler: "Ungültiges Angebot." };
  if (!pfad.startsWith(`${angebotId}/`) || pfad.length > 300 || pfad.includes("..")) return { fehler: "Ungültiger Bildpfad." };
  const text = unterschrift.trim().slice(0, 200);

  const supabase = await createClient();
  const ordner = pfad.split("/")[0];
  const datei = pfad.split("/").slice(1).join("/");
  const { data: dateien } = await supabase.storage.from("angebotsbilder").list(ordner, { search: datei, limit: 5 });
  if (!dateien?.some((f) => f.name === datei)) return { fehler: "Das Bild ist nicht angekommen. Bitte nochmal hochladen." };

  const { data, error } = await supabase
    .from("quote_items")
    .insert({ quote_id: angebotId, typ: "bild", kurztext: text || null, bild_pfad: pfad, sortierung: await naechsteSortierung(angebotId) })
    .select("id")
    .single();
  if (error) return { fehler: dbMeldung(error) };
  if (nachId) await bausteinNach(angebotId, data.id, nachId);
  aktualisieren(angebotId);
  return { id: data.id };
}
