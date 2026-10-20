import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, LockIcon } from "lucide-react";
import { cn } from "cn";
import { ZeitenReiter } from "@/components/layout/zeiten-reiter";
import { requireUser } from "@/lib/auth";
import { heuteIso, istIsoDatum, monatsGrenzen, tageVerschieben } from "@/lib/datum";
import { formatDatum, formatMonat, formatStunden } from "@/lib/format";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { initialen } from "@/lib/profil";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { ZEIT_ART_NAMEN, fruehesterAenderbarerTag, uhrzeitKurz, zeitNochAenderbar } from "@/lib/zeiten";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";
import { tagZahl, wochentagLang, wochenstart } from "@/lib/woche";
import { Warteschlange } from "../warteschlange";
import { ZeitenFilter } from "./zeiten-filter";

export const metadata: Metadata = { title: "Zeiten" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ZeitenSeite({ searchParams }: PageProps<"/zeiten">) {
  const nutzer = await requireUser();
  const { bereich: bereichParam, datum: datumParam, projekt: projektParam } = await searchParams;
  const heute = heuteIso();
  const bereich = bereichParam === "monat" ? "monat" : "woche";
  const anker = istIsoDatum(datumParam) && datumParam <= heute ? datumParam : heute;
  const projektFilter = typeof projektParam === "string" && UUID.test(projektParam) ? projektParam : "";

  // Zeitraum: Woche (Mo–So) oder Monat
  const von = bereich === "woche" ? wochenstart(anker) : monatsGrenzen(anker.slice(0, 7)).erster;
  const bis = bereich === "woche" ? tageVerschieben(von, 6) : monatsGrenzen(anker.slice(0, 7)).letzter;
  const zurueckAnker = tageVerschieben(von, -1);
  const vorAnker = tageVerschieben(bis, 1);
  const titel = bereich === "woche" ? `${formatDatum(von).slice(0, 6)}–${formatDatum(bis)}` : formatMonat(anker.slice(0, 7));

  const supabase = await createClient();
  const [einstellungen, kollegen, { data, error }] = await Promise.all([
    zeiterfassungEinstellungen(),
    kollegenLaden(),
    supabase
      .from("time_entries")
      .select("id, datum, von, bis, stunden, art, beschreibung, user_id, erstellt_von, project_id, projects(name)")
      // eigene Zeiten und die, die ich für Kollegen eingetragen habe
      .or(`user_id.eq.${nutzer.id},erstellt_von.eq.${nutzer.id}`)
      .is("archiviert_am", null)
      .gte("datum", von)
      .lte("datum", bis)
      .order("datum", { ascending: false })
      .order("von", { ascending: true }),
  ]);
  if (error) throw new Error("Die Zeiten konnten nicht geladen werden.");

  const projekteImZeitraum = [...new Map(data.filter((t) => t.project_id && t.projects).map((t) => [t.project_id!, t.projects!.name])).entries()]
    .map(([wert, name]) => ({ wert, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
  const sichtbar = projektFilter ? data.filter((t) => t.project_id === projektFilter) : data;

  const darfAlles = istBueroRolle(nutzer.rolle);
  const vorname = (id: string | null) => (id ? kollegen.get(id)?.vorname ?? "Kollege" : "");
  const meinName = `${nutzer.vorname} ${nutzer.nachname}`.trim();
  const personName = (uid: string) => (uid === nutzer.id ? meinName : (() => { const k = kollegen.get(uid); return k ? `${k.vorname} ${k.nachname}`.trim() : "Kollege"; })());
  const meine = sichtbar.filter((t) => t.user_id === nutzer.id);
  const tage = [...new Set(sichtbar.map((t) => t.datum))];
  const summe = meine.reduce((s, t) => s + Number(t.stunden), 0);
  const offenAb = fruehesterAenderbarerTag(heute, einstellungen.kulanzTage);

  const link = (a: string) => {
    const p = new URLSearchParams();
    if (bereich === "monat") p.set("bereich", "monat");
    if (a !== heute) p.set("datum", a);
    if (projektFilter) p.set("projekt", projektFilter);
    const t = p.toString();
    return t ? `/zeiten?${t}` : "/zeiten";
  };
  const pfeil = "flex size-12 items-center justify-center rounded-full hover:bg-muted";

  return (
    <div className="flex flex-col gap-4">
      <ZeitenReiter aktiv="zeiten" />
      <Warteschlange userId={nutzer.id} />
      <ZeitenFilter bereich={bereich} projekt={projektFilter} projekte={projekteImZeitraum} />

      <div className="grid grid-cols-[3rem_1fr_3rem] items-center">
        <Link href={link(zurueckAnker)} aria-label={bereich === "woche" ? "Vorherige Woche" : "Vormonat"} className={pfeil}>
          <ChevronLeftIcon className="size-6" />
        </Link>
        <p className="text-center">
          <span className="font-semibold">{titel}</span>
          <span className="ml-2 text-muted-foreground">{formatStunden(summe)}</span>
        </p>
        {vorAnker <= heute ? (
          <Link href={link(vorAnker)} aria-label={bereich === "woche" ? "Nächste Woche" : "Nächster Monat"} className={pfeil}>
            <ChevronRightIcon className="size-6" />
          </Link>
        ) : (
          <span className="size-12" />
        )}
      </div>

      {!darfAlles && bis < offenAb && (
        <p className="text-sm text-muted-foreground">Dieser Zeitraum ist abgeschlossen. Änderungen bitte im Büro melden.</p>
      )}

      {tage.length === 0 && (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">Keine Zeiten in diesem Zeitraum.</p>
      )}

      {tage.map((tag) => {
        const eintraege = sichtbar.filter((t) => t.datum === tag);
        const eigene = eintraege.filter((t) => t.user_id === nutzer.id);
        const fuerAndere = eintraege.filter((t) => t.user_id !== nutzer.id);
        const tagesSumme = eigene.reduce((s, t) => s + Number(t.stunden), 0);
        return (
          <section key={tag} className="overflow-hidden rounded-xl border bg-card">
            <h2 className="flex items-baseline justify-between gap-2 border-b bg-muted/40 px-4 py-2">
              <span>
                <span className="font-semibold">{tagZahl(tag)}</span> <span className="text-muted-foreground">{wochentagLang(tag)}</span>
              </span>
              {eigene.length > 0 && <span className="font-medium">{formatStunden(tagesSumme)}</span>}
            </h2>
            <ul className="flex flex-col divide-y">
              {eigene.map((t) => (
                <li key={t.id}>
                  <Eintrag
                    id={t.id}
                    zeit={t.von ? `${uhrzeitKurz(t.von)} – ${uhrzeitKurz(t.bis)}` : ZEIT_ART_NAMEN[t.art]}
                    projekt={t.projects?.name}
                    art={t.von && t.art !== "arbeitszeit" ? ZEIT_ART_NAMEN[t.art] : null}
                    person={personName(t.user_id)}
                    hinweis={t.erstellt_von && t.erstellt_von !== nutzer.id ? `eingetragen von ${vorname(t.erstellt_von)}` : null}
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
                    zeit={t.von ? `${uhrzeitKurz(t.von)} – ${uhrzeitKurz(t.bis)}` : ZEIT_ART_NAMEN[t.art]}
                    projekt={t.projects?.name}
                    art={null}
                    person={personName(t.user_id)}
                    hinweis="von dir eingetragen"
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

function Eintrag({ id, zeit, projekt, art, person, hinweis, stunden, gesperrt, gedimmt }: {
  id: string;
  zeit: string;
  projekt: string | null | undefined;
  art: string | null;
  person: string;
  hinweis: string | null;
  stunden: number;
  gesperrt: boolean;
  gedimmt?: boolean;
}) {
  const [vorn, nachn] = person.split(" ");
  return (
    <Link href={`/zeiten/${id}`} className={cn("flex min-h-16 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted", gedimmt && "text-muted-foreground")}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">
          {zeit}
          {art && <span className="font-normal text-muted-foreground"> · {art}</span>}
        </span>
        {projekt && <span className="block truncate text-sm text-muted-foreground">{projekt}</span>}
        <span className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initialen(vorn ?? "", nachn ?? "")}</span>
          <span className="truncate">{person}{hinweis ? ` · ${hinweis}` : ""}</span>
        </span>
      </span>
      <span className="shrink-0 font-medium">{formatStunden(stunden)}</span>
      {gesperrt ? <LockIcon className="size-4 shrink-0 text-muted-foreground" aria-label="nicht änderbar" /> : <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />}
    </Link>
  );
}
