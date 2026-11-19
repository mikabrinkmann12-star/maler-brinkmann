import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NeueAnfrage } from "@/lib/anfrage";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

export type AnfrageErgebnis = { id: string; doppelt: boolean };

/**
 * Legt die Website-Anfrage an. Ein zweites Senden derselben Anfrage (gleiche ID) legt nichts doppelt an
 * (insert … on conflict do nothing). Nur mit dem Dienst-Client aufrufen (Webhook), Nutzer dürfen nicht eintragen.
 */
export async function anfrageSpeichern(db: Db, a: NeueAnfrage): Promise<AnfrageErgebnis> {
  const leer = (s: string) => (s === "" ? null : s);
  const { data, error } = await db
    .from("website_anfragen")
    .upsert(
      {
        id: a.id,
        name: a.name,
        telefon: leer(a.telefon),
        email: leer(a.email),
        betreff: a.betreff,
        nachricht: a.nachricht,
        strasse: leer(a.strasse),
        plz: leer(a.plz),
        ort: leer(a.ort),
        quelle: a.quelle,
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);
  // Bei einem Konflikt kommt keine Zeile zurück: die Anfrage gab es schon
  return { id: a.id, doppelt: !data?.length };
}
