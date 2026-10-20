import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiScope } from "@/lib/api-schluessel";
import type { Database } from "@/lib/supabase/database.types";

/** Alles, was ein Handler der Schnittstelle braucht. `db` ist der Dienst-Client (umgeht RLS): Jeder Handler prüft und begrenzt selbst. */
export type ApiKontext = {
  db: SupabaseClient<Database>;
  /** Der Admin, der den Schlüssel angelegt hat: in seinem Namen werden Einträge geschrieben */
  nutzerId: string;
  schluesselId: string;
  params: Record<string, string>;
  query: URLSearchParams;
  /** Geparster JSON-Körper (nur bei POST), sonst null */
  body: unknown;
};

export type ApiRoute = {
  methode: "GET" | "POST";
  /** z. B. „projekte/:id“ */
  pfad: string;
  scope: ApiScope;
  titel: string;
  /** Kurzbeschreibung der Abfrage-Parameter */
  parameter?: string;
  /** Kurzbeschreibung des JSON-Körpers */
  koerper?: string;
  handler: (c: ApiKontext) => Promise<unknown>;
};

/** Fehler mit HTTP-Status und verständlicher deutscher Meldung. */
export class ApiFehler extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
