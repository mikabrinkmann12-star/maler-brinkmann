import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Client mit Secret Key: UMGEHT RLS. Nur für Admin-Aufgaben benutzen
 * (Nutzer anlegen/sperren, Flags setzen) und nur NACH requireRole()!
 * "server-only" verhindert, dass diese Datei im Browser-Code landet.
 */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
