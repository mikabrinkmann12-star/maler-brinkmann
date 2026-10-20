import "server-only";
import { istContainerArt, type ContainerMeldung } from "@/lib/container";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { createClient } from "@/lib/supabase/server";

/** Die letzten Container-Meldungen (neueste zuerst). Alle aktiven Nutzer dürfen lesen (für „gesperrt bis …“). */
export async function containerMeldungenLaden(limit = 30): Promise<ContainerMeldung[]> {
  const supabase = await createClient();
  const [{ data }, kollegen] = await Promise.all([
    supabase
      .from("container_requests")
      .select("id, art, created_at, ausgeloest_von, erledigt_am, notiz, freigegeben_am")
      .order("created_at", { ascending: false })
      .limit(limit),
    kollegenLaden(),
  ]);
  return (data ?? [])
    .filter((r) => istContainerArt(r.art))
    .map((r) => {
      const k = r.ausgeloest_von ? kollegen.get(r.ausgeloest_von) : undefined;
      return {
        id: r.id,
        art: r.art as ContainerMeldung["art"],
        zeit: r.created_at,
        wer: k ? `${k.vorname} ${k.nachname}`.trim() : "Jemand",
        erledigt: r.erledigt_am !== null,
        notiz: r.notiz ?? "",
        freigegeben: r.freigegeben_am !== null,
      };
    });
}

/** Zahl der gemeldeten Container, die das Büro noch nicht als erledigt markiert hat (für die Übersicht). */
export async function containerOffenAnzahl(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("container_requests").select("id", { count: "exact", head: true }).is("erledigt_am", null);
  return count ?? 0;
}
