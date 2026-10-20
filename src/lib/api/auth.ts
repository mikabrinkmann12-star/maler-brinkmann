import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashVon, istSchluesselFormat, schluesselAusAnfrage, type ApiScope } from "@/lib/api-schluessel";
import type { Database } from "@/lib/supabase/database.types";

// Prüft den API-Schlüssel einer Anfrage. Der Schlüssel gilt nur, solange er nicht widerrufen ist und der Admin, der ihn angelegt hat,
// noch ein aktiver Admin ist. Pro Schlüssel höchstens 120 Anfragen pro Minute.

export const MAX_ANFRAGEN_PRO_MINUTE = 120;

export type ApiSchluessel = { id: string; scopes: ApiScope[]; nutzerId: string };
export type AnmeldeErgebnis = { ok: true; schluessel: ApiSchluessel } | { ok: false; status: number; fehler: string; schluesselId?: string };

export async function apiAnmelden(request: Request, db: SupabaseClient<Database>): Promise<AnmeldeErgebnis> {
  const klartext = schluesselAusAnfrage(request.headers);
  if (!klartext) return { ok: false, status: 401, fehler: "Es fehlt der API-Schlüssel (Header „Authorization: Bearer …“ oder „X-API-Key“)." };
  if (!istSchluesselFormat(klartext)) return { ok: false, status: 401, fehler: "Der API-Schlüssel ist ungültig." };

  const { data: k } = await db
    .from("api_keys")
    .select("id, scopes, created_by, revoked_at, last_used_at")
    .eq("key_hash", hashVon(klartext))
    .maybeSingle();
  if (!k || k.revoked_at) return { ok: false, status: 401, fehler: "Der API-Schlüssel ist ungültig oder widerrufen." };

  const { data: admin } = await db.from("profiles").select("rolle, aktiv").eq("id", k.created_by).maybeSingle();
  if (!admin || !admin.aktiv || admin.rolle !== "admin") {
    return { ok: false, status: 403, fehler: "Der Admin, der diesen Schlüssel angelegt hat, ist nicht mehr aktiv. Bitte einen neuen Schlüssel anlegen.", schluesselId: k.id };
  }

  const seit = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from("api_log").select("id", { count: "exact", head: true }).eq("key_id", k.id).gte("created_at", seit);
  if ((count ?? 0) >= MAX_ANFRAGEN_PRO_MINUTE) {
    return { ok: false, status: 429, fehler: "Zu viele Anfragen. Bitte eine Minute warten.", schluesselId: k.id };
  }

  // „Zuletzt benutzt“ höchstens einmal pro Minute schreiben
  if (!k.last_used_at || Date.now() - new Date(k.last_used_at).getTime() > 60_000) {
    await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", k.id);
  }
  return { ok: true, schluessel: { id: k.id, scopes: k.scopes.filter((s): s is ApiScope => s === "lesen" || s === "schreiben"), nutzerId: k.created_by } };
}

export async function apiProtokollieren(db: SupabaseClient<Database>, schluesselId: string | null, methode: string, pfad: string, status: number) {
  try {
    await db.from("api_log").insert({ key_id: schluesselId, methode, pfad: pfad.slice(0, 300), status });
  } catch {
    // Protokoll ist Zusatz: Die Antwort geht trotzdem raus
  }
}
