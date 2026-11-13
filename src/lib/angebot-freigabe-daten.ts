import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashVon } from "@/lib/api-schluessel";
import { istLinkSchluessel, linkSchluesselErzeugen } from "@/lib/angebot-freigabe";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

/** Neue Freigabe für ein Angebot (Büro, eigener Client mit RLS). Der Klartext-Schlüssel kommt nur hier zurück und steht nur im Link. */
export async function freigabeAnlegen(db: Db, angebotId: string, an: string): Promise<{ klartext: string; id: string } | { fehler: string }> {
  const s = linkSchluesselErzeugen();
  const { data, error } = await db.from("quote_shares").insert({ quote_id: angebotId, token_hash: s.hash, an }).select("id").single();
  if (error) return { fehler: "Der Link zum Angebot konnte nicht angelegt werden." };
  return { klartext: s.klartext, id: data.id };
}

export type GueltigeFreigabe = { id: string; quoteId: string; an: string };

/** Freigabe zum Schlüssel aus dem Link (Dienst-Client). Abgelaufene, widerrufene und unbekannte Schlüssel geben null. */
export async function freigabeFinden(db: Db, klartext: string): Promise<GueltigeFreigabe | null> {
  if (!istLinkSchluessel(klartext)) return null;
  const { data } = await db.from("quote_shares").select("id, quote_id, an, expires_at, revoked_at").eq("token_hash", hashVon(klartext)).maybeSingle();
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  return { id: data.id, quoteId: data.quote_id, an: data.an ?? "" };
}

/** Eine Öffnung festhalten (Zähler, erste/letzte Zeit). Beim ersten Öffnen bekommt das Büro einen Hinweis. */
export async function oeffnungErfassen(db: Db, freigabe: GueltigeFreigabe): Promise<void> {
  const { data: s } = await db.from("quote_shares").select("open_count, first_opened_at, last_opened_at").eq("id", freigabe.id).maybeSingle();
  if (!s) return;
  // Mehrfaches Laden derselben Seite innerhalb von 30 Sekunden zählt nur einmal
  if (s.last_opened_at && Date.now() - new Date(s.last_opened_at).getTime() < 30_000) return;
  const jetzt = new Date().toISOString();
  await db
    .from("quote_shares")
    .update({ open_count: s.open_count + 1, last_opened_at: jetzt, first_opened_at: s.first_opened_at ?? jetzt })
    .eq("id", freigabe.id);
  if (s.first_opened_at) return;
  const { data: q } = await db.from("quotes").select("betreff, project_id").eq("id", freigabe.quoteId).maybeSingle();
  if (!q) return;
  await db.from("notifications").insert({
    typ: "angebot_geoeffnet",
    text: `Das Angebot „${q.betreff}“ wurde${freigabe.an ? ` von ${freigabe.an}` : ""} geöffnet.`,
    project_id: q.project_id,
  });
}

export async function pdfHeruntergeladen(db: Db, freigabeId: string): Promise<void> {
  await db.from("quote_shares").update({ pdf_loaded_at: new Date().toISOString() }).eq("id", freigabeId);
}

export type Oeffnung = { erstAm: string | null; zuletztAm: string | null; anzahl: number; pdfAm: string | null; an: string };

/** Zusammenfassung der Öffnungen je Angebot (über alle Freigaben des Angebots); Angebote ohne Freigabe fehlen in der Karte. */
export async function oeffnungenLaden(db: Db, angebotIds: string[]): Promise<Map<string, Oeffnung>> {
  const karte = new Map<string, Oeffnung>();
  if (!angebotIds.length) return karte;
  const { data } = await db
    .from("quote_shares")
    .select("quote_id, an, first_opened_at, last_opened_at, open_count, pdf_loaded_at, created_at")
    .in("quote_id", angebotIds)
    .order("created_at", { ascending: false })
    .limit(2000);
  for (const s of data ?? []) {
    const alt = karte.get(s.quote_id);
    if (!alt) {
      karte.set(s.quote_id, { erstAm: s.first_opened_at, zuletztAm: s.last_opened_at, anzahl: s.open_count, pdfAm: s.pdf_loaded_at, an: s.an ?? "" });
    } else {
      karte.set(s.quote_id, {
        erstAm: [alt.erstAm, s.first_opened_at].filter((x): x is string => Boolean(x)).sort()[0] ?? null,
        zuletztAm: [alt.zuletztAm, s.last_opened_at].filter((x): x is string => Boolean(x)).sort().at(-1) ?? null,
        anzahl: alt.anzahl + s.open_count,
        pdfAm: [alt.pdfAm, s.pdf_loaded_at].filter((x): x is string => Boolean(x)).sort().at(-1) ?? null,
        an: alt.an,
      });
    }
  }
  return karte;
}

export type AntwortStand = { antwort: "angenommen" | "abgelehnt"; am: string; name: string } | null;

/** Antwort des Kunden zu einem Angebot (über alle Freigaben; die erste zählt). */
export async function antwortLaden(db: Db, angebotId: string): Promise<AntwortStand> {
  const { data } = await db
    .from("quote_shares")
    .select("antwort, antwort_am, antwort_name")
    .eq("quote_id", angebotId)
    .not("antwort", "is", null)
    .order("antwort_am", { ascending: true })
    .limit(1);
  const s = data?.[0];
  if (!s?.antwort || !s.antwort_am) return null;
  return { antwort: s.antwort as "angenommen" | "abgelehnt", am: s.antwort_am, name: s.antwort_name ?? "" };
}

/**
 * Antwort aus der Online-Ansicht speichern (Dienst-Client, nur nach freigabeFinden). Erst wird der Status des Angebots
 * von „versendet“ umgestellt (nur wenn er noch so steht, damit zählt nur die erste Antwort), dann die Antwort an der Freigabe
 * festgehalten und das Büro benachrichtigt.
 */
export async function antwortSpeichern(
  db: Db,
  freigabe: GueltigeFreigabe,
  e: { antwort: "angenommen" | "abgelehnt"; name: string; grund?: string },
): Promise<{ ok: true } | { fehler: string }> {
  const { data: q, error } = await db
    .from("quotes")
    .update({ status: e.antwort })
    .eq("id", freigabe.quoteId)
    .eq("status", "versendet")
    .select("betreff, project_id")
    .maybeSingle();
  if (error || !q) return { fehler: "Die Antwort konnte nicht gespeichert werden. Bitte melden Sie sich bei uns." };
  await db
    .from("quote_shares")
    .update({ antwort: e.antwort, antwort_am: new Date().toISOString(), antwort_name: e.name || null, antwort_grund: e.grund || null })
    .eq("id", freigabe.id)
    .is("antwort", null);
  const wer = e.name || freigabe.an;
  await db.from("notifications").insert({
    typ: e.antwort === "angenommen" ? "angebot_angenommen" : "angebot_abgelehnt",
    text: `Das Angebot „${q.betreff}“ wurde${wer ? ` von ${wer}` : ""} online ${e.antwort === "angenommen" ? "angenommen" : "abgelehnt"}.${e.grund ? ` Grund: ${e.grund}` : ""}`.slice(0, 1000),
    project_id: q.project_id,
  });
  return { ok: true };
}
