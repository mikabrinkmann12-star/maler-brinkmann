import type { Metadata } from "next";
import { cn } from "cn";
import { UrlaubskontoAnzeige } from "@/components/urlaubskonto-anzeige";
import { requireUser } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatDatum, formatDatumZeit } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { kontenLaden } from "@/lib/ueberstunden-daten";
import { URLAUB_ART_NAMEN, URLAUB_STATUS_FARBE, URLAUB_STATUS_NAMEN, urlaubskonto, werktage, type UrlaubArt } from "@/lib/urlaub";
import { Warteschlange } from "../warteschlange";
import { UrlaubFormular } from "./urlaub-formular";
import { Zurueckziehen } from "./zurueckziehen";

export const metadata: Metadata = { title: "Urlaub" };

export default async function UrlaubSeite() {
  const nutzer = await requireUser();
  const heute = heuteIso();
  const jahr = Number(heute.slice(0, 4));
  const supabase = await createClient();
  const [{ data: antraege }, { data: profil }, konten] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, von, bis, art, bemerkung, status, antwort, entschieden_am, created_at")
      .eq("user_id", nutzer.id) // auch Büro/Admin sehen hier nur ihre eigenen
      .order("von", { ascending: false })
      .limit(100),
    supabase.from("profiles").select("urlaubstage_jahr").eq("id", nutzer.id).maybeSingle(),
    kontenLaden({ monat: heute.slice(0, 7), userIds: [nutzer.id] }), // immer nur das eigene Konto
  ]);
  const ueberstundenkonto = konten.get(nutzer.id);
  // Dieses Jahr, dazu das nächste, sobald es dort Anträge gibt
  const jahre = (antraege ?? []).some((a) => a.bis >= `${jahr + 1}-01-01`) ? [jahr, jahr + 1] : [jahr];
  const urlaubskonten = jahre.map((j) => urlaubskonto(profil?.urlaubstage_jahr ?? null, antraege ?? [], j));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Urlaub</h1>
      <Warteschlange userId={nutzer.id} />
      {urlaubskonten.map((k) => <UrlaubskontoAnzeige key={k.jahr} konto={k} />)}
      <UrlaubFormular
        ichId={nutzer.id}
        heute={heute}
        konto={ueberstundenkonto ? {
          stand: ueberstundenkonto.stand,
          soll: ueberstundenkonto.soll,
          vorgemerkt: (antraege ?? []).filter((a) => a.art === "ueberstundenabbau" && (a.status === "offen" || a.status === "genehmigt") && a.bis >= heute),
        } : null}
      />

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
