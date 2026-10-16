"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Supabase-Client im Browser (nur für Speicher-Uploads wie Fotos, die zu groß
 * für Server-Aktionen sind). Arbeitet mit der Anmeldung des Nutzers, RLS greift.
 * Daten in Tabellen immer über Server-Aktionen schreiben.
 */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
}
