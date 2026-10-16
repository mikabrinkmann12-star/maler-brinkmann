import type { Metadata } from "next";
import { cn } from "cn";
import { UrlaubskontoAnzeige } from "@/components/urlaubskonto-anzeige";
import { requireRole } from "@/lib/auth";
import { heuteIso, tageVerschieben } from "@/lib/datum";
import { formatDatum, formatDatumZeit, formatStunden, formatStundenSaldo } from "@/lib/format";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { abbauPruefen } from "@/lib/ueberstunden";
import { kontenLaden } from "@/lib/ueberstunden-daten";
import { URLAUB_ART_NAMEN, URLAUB_STATUS_FARBE, URLAUB_STATUS_NAMEN, urlaubskonto, werktage, type UrlaubArt } from "@/lib/urlaub";
import { Entscheidung } from "./entscheidung";

export const metadata: Metadata = { title: "Urlaub" };

export default async function BueroUrlaubSeite() {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const istAdmin = nutzer.rolle === "admin";
  const supabase = await createClient();
  const jahr = Number(heuteIso().slice(0, 4));
  const [{ data: antraege, error }, { data: profile }, { data: fuerKonto }, ueberstundenkonten] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, user_id, von, bis, art, bemerkung, status, antwort, entschieden_von, entschieden_am, created_at")
      // offene immer, sonst die der letzten 60 Tage und alles Künftige
      .or(`status.eq.offen,bis.gte.${tageVerschieben(heuteIso(), -60)}`)
      .order("von"),
    supabase.from("profiles").select("id, vorname, nachname, urlaubstage_jahr"),
    // Für den Resturlaub: alle offenen und genehmigten Anträge ab diesem Jahr
    supabase.from("leave_requests").select("id, user_id, von, bis, art, status")
      .in("status", ["offen", "genehmigt"]).gte("bis", `${jahr}-01-01`),
    kontenLaden({ monat: heuteIso().slice(0, 7) }),
  ]);
  if (error) throw new Error("Die Urlaubsanträge konnten nicht geladen werden.");

  const name = (id: string | null) => {
    const p = profile?.find((x) => x.id === id);
    return p ? `${p.vorname} ${p.nachname}`.trim() : "–";
  };
  const konto = (userId: string, j: number) =>
    urlaubskonto(
      profile?.find((x) => x.id === userId)?.urlaubstage_jahr ?? null,
      (fuerKonto ?? []).filter((a) => a.user_id === userId),
      j,
    );
  /** Für „Überstunden abfeiern“: Konto-Stand und ob es für diesen Antrag reicht (der Admin entscheidet trotzdem). */
  const abbauInfo = (a: (typeof antraege)[number]) => {
    const k = ueberstundenkonten.get(a.user_id);
    if (!k) return <p className="mt-1 text-sm text-amber-800">Für {name(a.user_id)} ist kein Überstundenkonto eingerichtet.</p>;
    const r = abbauPruefen({
      stand: k.stand, soll: k.soll, heute: heuteIso(), neu: { von: a.von, bis: a.bis },
      vorgemerkt: (fuerKonto ?? []).filter((x) => x.user_id === a.user_id && x.art === "ueberstundenabbau" && x.id !== a.id && x.bis >= heuteIso()),
    });
    return (
      <p className={cn("mt-1 text-sm", r.ok ? "text-muted-foreground" : "font-medium text-destructive")}>
        Überstundenkonto {formatStundenSaldo(k.stand)} (bis gestern). Der Antrag braucht {formatStunden(r.benoetigt)}
        {r.reserviert > 0 && `, andere Anträge ${formatStunden(r.reserviert)}`} → danach {formatStundenSaldo(r.nachher)}
        {r.ok ? "." : ". Das Konto reicht nicht."}
      </p>
    );
  };
  const offen = antraege.filter((a) => a.status === "offen");
  const erledigt = antraege.filter((a) => a.status !== "offen").reverse();

  const karte = (a: (typeof antraege)[number]) => (
    <li key={a.id} className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{name(a.user_id)}</p>
          <p>
            {formatDatum(a.von)}–{formatDatum(a.bis)} · {werktage(a.von, a.bis)} Werktage · {URLAUB_ART_NAMEN[a.art as UrlaubArt] ?? a.art}
          </p>
          {a.bemerkung && <p className="text-sm">„{a.bemerkung}“</p>}
          <p className="text-xs text-muted-foreground">
            Gestellt am {formatDatumZeit(a.created_at)}
            {a.entschieden_am && ` · ${URLAUB_STATUS_NAMEN[a.status]} von ${name(a.entschieden_von)} am ${formatDatumZeit(a.entschieden_am)}`}
          </p>
          {a.antwort && <p className="mt-1 text-sm">Antwort: {a.antwort}</p>}
          {a.status === "offen" && a.art === "ueberstundenabbau" && abbauInfo(a)}
          {a.status === "offen" && a.art !== "ueberstundenabbau" &&
            [...new Set([Number(a.von.slice(0, 4)), Number(a.bis.slice(0, 4))])].map((j) => (
              <UrlaubskontoAnzeige key={j} konto={konto(a.user_id, j)} kompakt />
            ))}
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-medium", URLAUB_STATUS_FARBE[a.status])}>
          {URLAUB_STATUS_NAMEN[a.status]}
        </span>
      </div>
      {a.status === "offen" && istAdmin && <Entscheidung antragId={a.id} name={name(a.user_id)} />}
    </li>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Urlaub</h1>
      {!istAdmin && (
        <p className="rounded-lg bg-muted p-3 text-sm">Urlaubsanträge genehmigt nur der Admin. Du siehst hier alle Anträge.</p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Offen ({offen.length})</h2>
        {offen.length === 0 && <p className="text-muted-foreground">Keine offenen Anträge.</p>}
        <ul className="flex flex-col gap-3">{offen.map(karte)}</ul>
      </section>

      {erledigt.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Entschieden und zurückgezogen</h2>
          <ul className="flex flex-col gap-3">{erledigt.map(karte)}</ul>
        </section>
      )}
    </div>
  );
}
