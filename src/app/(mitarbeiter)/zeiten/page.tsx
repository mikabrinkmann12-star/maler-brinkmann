import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, LockIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { heuteIso, istMonat, monatVerschieben, monatsGrenzen } from "@/lib/datum";
import { formatDatum, formatMonat, formatStunden, formatTagKurz } from "@/lib/format";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { ZEIT_ARTEN, ZEIT_ART_NAMEN, fruehesterAenderbarerTag, uhrzeitKurz, zeitNochAenderbar } from "@/lib/zeiten";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";
import { Warteschlange } from "./warteschlange";

export const metadata: Metadata = { title: "Zeiten" };

export default async function ZeitenSeite({ searchParams }: PageProps<"/zeiten">) {
  const nutzer = await requireUser();
  const { monat: monatParam } = await searchParams;
  const heute = heuteIso();
  const dieserMonat = heute.slice(0, 7);
  const monat = istMonat(monatParam) && monatParam <= dieserMonat ? monatParam : dieserMonat;
  const { erster, letzter } = monatsGrenzen(monat);

  const supabase = await createClient();
  const [einstellungen, kollegen, { data, error }] = await Promise.all([
    zeiterfassungEinstellungen(),
    kollegenLaden(),
    supabase
      .from("time_entries")
      .select("id, datum, von, bis, stunden, art, beschreibung, user_id, erstellt_von, projects(name)")
      // eigene Zeiten und die, die ich für Kollegen eingetragen habe
      .or(`user_id.eq.${nutzer.id},erstellt_von.eq.${nutzer.id}`)
      .is("archiviert_am", null)
      .gte("datum", erster)
      .lte("datum", letzter)
      .order("datum", { ascending: false })
      .order("von", { ascending: true }),
  ]);
  if (error) throw new Error("Die Zeiten konnten nicht geladen werden.");

  const darfAlles = istBueroRolle(nutzer.rolle);
  const vorname = (id: string | null) => (id ? kollegen.get(id)?.vorname ?? "Kollege" : "");
  const meine = data.filter((t) => t.user_id === nutzer.id);
  const tage = [...new Set(data.map((t) => t.datum))];
  const summe = meine.reduce((s, t) => s + Number(t.stunden), 0);
  const jeArt = ZEIT_ARTEN.map((art) => ({
    art,
    stunden: meine.filter((t) => t.art === art).reduce((s, t) => s + Number(t.stunden), 0),
  })).filter((x) => x.stunden > 0);
  const offenAb = fruehesterAenderbarerTag(heute, einstellungen.kulanzTage);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Meine Zeiten</h1>

      <Link href="/zeiten/neu" className={buttonVariants({ size: "touch", className: "w-full" })}>
        <PlusIcon /> Zeit eintragen
      </Link>

      <Warteschlange userId={nutzer.id} />

      {/* Monat wählen */}
      <div className="flex items-center justify-between gap-2">
        <Link href={`/zeiten?monat=${monatVerschieben(monat, -1)}`} aria-label="Vormonat"
          className={buttonVariants({ variant: "outline", size: "icon-touch" })}>
          <ChevronLeftIcon />
        </Link>
        <p className="text-lg font-semibold">{formatMonat(monat)}</p>
        {monat < dieserMonat ? (
          <Link href={`/zeiten?monat=${monatVerschieben(monat, 1)}`} aria-label="Nächster Monat"
            className={buttonVariants({ variant: "outline", size: "icon-touch" })}>
            <ChevronRightIcon />
          </Link>
        ) : (
          <span className="size-12" />
        )}
      </div>

      {/* Summe */}
      <div className="flex flex-col gap-1 rounded-xl bg-muted p-4">
        <p className="flex items-baseline justify-between gap-2">
          <span>Summe {formatMonat(monat)}</span>
          <span className="text-xl font-semibold">{formatStunden(summe)}</span>
        </p>
        {jeArt.length > 1 && (
          <ul className="text-sm text-muted-foreground">
            {jeArt.map((x) => (
              <li key={x.art} className="flex justify-between"><span>{ZEIT_ART_NAMEN[x.art]}</span><span>{formatStunden(x.stunden)}</span></li>
            ))}
          </ul>
        )}
        {!darfAlles && (
          <p className="text-sm text-muted-foreground">
            {letzter < offenAb
              ? "Dieser Monat ist abgeschlossen. Änderungen bitte im Büro melden."
              : `Eintragen und ändern geht ab dem ${formatDatum(offenAb)}.`}
          </p>
        )}
      </div>

      {tage.length === 0 && (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">Noch keine Zeiten in diesem Monat.</p>
      )}

      {tage.map((tag) => {
        const eintraege = data.filter((t) => t.datum === tag);
        const eigene = eintraege.filter((t) => t.user_id === nutzer.id);
        const fuerAndere = eintraege.filter((t) => t.user_id !== nutzer.id);
        const tagesSumme = eigene.reduce((s, t) => s + Number(t.stunden), 0);
        return (
          <section key={tag} className="flex flex-col gap-2">
            <h2 className="flex items-baseline justify-between gap-2 px-1">
              <span className="font-semibold">{formatTagKurz(tag)}</span>
              {eigene.length > 0 && <span className="text-muted-foreground">{formatStunden(tagesSumme)}</span>}
            </h2>
            <ul className="flex flex-col divide-y rounded-xl border">
              {eigene.map((t) => (
                <li key={t.id}>
                  <Eintrag
                    id={t.id}
                    zeit={t.von ? `${uhrzeitKurz(t.von)}–${uhrzeitKurz(t.bis)}` : ZEIT_ART_NAMEN[t.art]}
                    unten={[
                      t.projects?.name,
                      t.von && t.art !== "arbeitszeit" ? ZEIT_ART_NAMEN[t.art] : null,
                      t.erstellt_von && t.erstellt_von !== nutzer.id ? `eingetragen von ${vorname(t.erstellt_von)}` : null,
                    ]}
                    stunden={Number(t.stunden)}
                    gesperrt={!darfAlles && (!zeitNochAenderbar(t.datum, heute, einstellungen.kulanzTage) || !einstellungen.erlaubteArten.includes(t.art))}
                  />
                </li>
              ))}
              {fuerAndere.map((t) => (
                <li key={t.id}>
                  <Eintrag
                    id={t.id}
                    gedimmt
                    zeit={`Für ${vorname(t.user_id)}: ${t.von ? `${uhrzeitKurz(t.von)}–${uhrzeitKurz(t.bis)}` : ZEIT_ART_NAMEN[t.art]}`}
                    unten={[t.projects?.name]}
                    stunden={Number(t.stunden)}
                    gesperrt
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Eintrag({ id, zeit, unten, stunden, gesperrt, gedimmt }: {
  id: string;
  zeit: string;
  unten: (string | null | undefined)[];
  stunden: number;
  gesperrt: boolean;
  gedimmt?: boolean;
}) {
  const text = unten.filter(Boolean).join(" · ");
  return (
    <Link href={`/zeiten/${id}`} className={cn("flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted", gedimmt && "text-muted-foreground")}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{zeit}</span>
        {text && <span className="block truncate text-sm text-muted-foreground">{text}</span>}
      </span>
      <span className="shrink-0 font-medium">{formatStunden(stunden)}</span>
      {gesperrt ? <LockIcon className="size-4 shrink-0 text-muted-foreground" aria-label="nicht änderbar" /> : <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />}
    </Link>
  );
}
