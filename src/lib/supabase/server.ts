import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Supabase-Client für Server Components, Server Actions und Route Handler.
 * Arbeitet mit den Rechten des eingeloggten Nutzers (RLS greift).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(zuSetzen) {
        try {
          zuSetzen.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // In Server Components dürfen keine Cookies gesetzt werden.
          // Kein Problem: Der Proxy (src/proxy.ts) erneuert die Session.
        }
      },
    },
  });
}
