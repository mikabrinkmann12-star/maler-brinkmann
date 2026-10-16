import type { Metadata } from "next";
import { cn } from "cn";
import { requireUser } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatDatum, formatDatumZeit } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { URLAUB_ART_NAMEN, URLAUB_STATUS_FARBE, URLAUB_STATUS_NAMEN, werktage, type UrlaubArt } from "@/lib/urlaub";
import { Warteschlange } from "../warteschlange";
import { UrlaubFormular } from "./urlaub-formular";
import { Zurueckziehen } from "./zurueckziehen";

export const metadata: Metadata = { title: "Urlaub" };

export default async function UrlaubSeite() {
  const nutzer = await requireUser();
  const heute = heuteIso();
  const supabase = await createClient();
  const { data: antraege } = await supabase
    .from("leave_requests")
    .select("id, von, bis, art, bemerkung, status, antwort, entschieden_am, created_at")
    .eq("user_id", nutzer.id) // auch Büro/Admin sehen hier nur ihre eigenen
    .order("von", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Urlaub</h1>
      <Warteschlange userId={nutzer.id} />
      <UrlaubFormular ichId={nutzer.id} heute={heute} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Meine Anträge</h2>
        {!antraege?.length && <p className="text-muted-foreground">Noch keine Anträge.</p>}
        <ul className="flex flex-col gap-3">
          {antraege?.map((a) => {
            const titel = `${formatDatum(a.von)}–${formatDatum(a.bis)}`;
            return (
              <li key={a.id} className="flex flex-col gap-2 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-medium">{titel}</p>
                    <p className="text-sm text-muted-foreground">
                      {URLAUB_ART_NAMEN[a.art as UrlaubArt] ?? a.art} · {werktage(a.von, a.bis)} Werktage
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-3 py-1 text-sm font-medium", URLAUB_STATUS_FARBE[a.status])}>
                    {URLAUB_STATUS_NAMEN[a.status]}
                  </span>
                </div>
                {a.bemerkung && <p className="text-sm">Deine Bemerkung: {a.bemerkung}</p>}
                {a.antwort && <p className="rounded-lg bg-muted p-2 text-sm">Antwort: {a.antwort}</p>}
                <p className="text-xs text-muted-foreground">
                  Gestellt am {formatDatumZeit(a.created_at)}
                  {a.entschieden_am && ` · entschieden am ${formatDatumZeit(a.entschieden_am)}`}
                </p>
                {a.status === "offen" && <Zurueckziehen ichId={nutzer.id} antragId={a.id} titel={titel} />}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
