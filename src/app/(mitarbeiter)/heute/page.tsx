import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClockIcon, ClockIcon, HardHatIcon, MapPinIcon, MessageSquareTextIcon, NavigationIcon, TruckIcon, UserIcon, UsersIcon } from "lucide-react";
import { AnrufLink } from "@/components/anruf-link";
import { ContainerKarte } from "@/components/container-karte";
import { containerMeldungenLaden } from "@/lib/container-daten";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { stoppZeitText, stoppsSortieren } from "@/lib/einsatz";
import { formatDatumLang, formatStunden } from "@/lib/format";
import { kollegenLaden, meineEinsaetze } from "@/lib/mitarbeiter-daten";
import { adresseText, kontaktName, mapsLink } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";
import { Warteschlange } from "../warteschlange";

export const metadata: Metadata = { title: "Heute" };

export default async function HeuteSeite() {
  const nutzer = await requireUser();
  const heute = heuteIso();
  const supabase = await createClient();
  const [einsaetze, kollegen, { data: heuteZeiten }, { data: termine }, containerMeldungen] = await Promise.all([
    meineEinsaetze(nutzer.id, heute),
    kollegenLaden(),
    supabase.from("time_entries").select("stunden").eq("user_id", nutzer.id).eq("datum", heute).is("archiviert_am", null),
    // Eigene Termine heute (Büro/Admin sehen per RLS alle, hier immer nur die eigenen)
    supabase
      .from("appointments")
      .select("id, titel, ort, zeit, notiz, project_id, appointment_members!inner(user_id)")
      .eq("datum", heute)
      .eq("appointment_members.user_id", nutzer.id)
      .is("archiviert_am", null)
      .order("zeit", { nullsFirst: false }),
    containerMeldungenLaden(),
  ]);
  const heuteStunden = (heuteZeiten ?? []).reduce((s, t) => s + Number(t.stunden), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-muted-foreground">{formatDatumLang(heute)}</p>
        <p className="text-2xl font-semibold">Moin, {nutzer.vorname}!</p>
        {heuteZeiten && heuteZeiten.length > 0 && (
          <Link href="/zeiten" className="mt-1 flex w-fit items-center gap-1 text-sm text-green-700 underline-offset-4 hover:underline">
            <ClockIcon className="size-4" /> Heute eingetragen: {formatStunden(heuteStunden)}
          </Link>
        )}
      </div>

      <Warteschlange userId={nutzer.id} />

      <ContainerKarte meldungen={containerMeldungen} />

      {(termine?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sky-950">
          <h2 className="flex items-center gap-2 font-semibold"><CalendarClockIcon className="size-5" /> Termine heute</h2>
          <ul className="flex flex-col gap-2">
            {termine?.map((t) => (
              <li key={t.id}>
                <p className="font-medium">{t.zeit ? `${t.zeit.slice(0, 5)} Uhr · ` : ""}{t.titel}</p>
                {t.ort && <p className="flex items-center gap-1 text-sm"><MapPinIcon className="size-4" /> {t.ort}</p>}
                {t.notiz && <p className="text-sm">{t.notiz}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href="/termine/neu" className="flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
        <CalendarClockIcon className="size-4" /> Termin eintragen
      </Link>

      {einsaetze.length === 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed p-5">
          <p className="text-lg font-medium">Für heute bist du nicht eingeteilt.</p>
          <p className="text-muted-foreground">Frag im Büro nach oder schau bei deinen Baustellen.</p>
          <Link href="/baustellen" className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}>
            <HardHatIcon />
            Meine Baustellen
          </Link>
        </div>
      )}

      {einsaetze.map((e) => {
        const stopps = stoppsSortieren(e.assignment_stops);
        const team = e.assignment_members
          .map((m) => kollegen.get(m.user_id))
          .filter((k): k is NonNullable<typeof k> => Boolean(k));
        const mehrere = stopps.length > 1;

        return (
          <article key={e.id} className="flex flex-col gap-5 rounded-2xl border p-5 shadow-sm">
            {/* Auto */}
            <div className="flex items-center gap-3 text-lg">
              <TruckIcon className="size-6 shrink-0" />
              <span className="font-semibold">{e.vehicles?.name ?? "Ohne Firmenwagen"}</span>
              {e.vehicles?.kennzeichen && <span className="text-muted-foreground">{e.vehicles.kennzeichen}</span>}
            </div>

            {/* Notiz vom Büro */}
            {e.notiz && (
              <div className="flex gap-3 rounded-xl bg-amber-50 p-4 text-amber-950">
                <MessageSquareTextIcon className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Notiz vom Büro</p>
                  <p className="text-base">{e.notiz}</p>
                </div>
              </div>
            )}

            {stopps.length === 0 && <p className="text-lg text-muted-foreground">Noch keine Baustelle eingetragen.</p>}
            {mehrere && (
              <p className="text-sm text-muted-foreground">
                Heute {stopps.length} Baustellen. Die Reihenfolge entscheidet ihr, außer es steht eine Zeit dabei.
              </p>
            )}

            {/* Baustellen (Stopps) */}
            {stopps.map((s, i) => {
              const p = s.projects;
              if (!p) return null;
              const anschrift = { strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort };
              const adresse = adresseText(anschrift);
              const navi = mapsLink(anschrift);
              const kunde = p.contacts;
              const bueroKontakt = p.buero_ansprechpartner_id ? kollegen.get(p.buero_ansprechpartner_id) : undefined;
              const zeit = stoppZeitText(s.zeit, s.zeit_art);
              return (
                <section key={s.id} className={mehrere ? "flex flex-col gap-4 rounded-xl border p-4" : "flex flex-col gap-4"}>
                  {mehrere && <p className="text-sm font-medium text-muted-foreground">Baustelle {i + 1}</p>}
                  <div className="flex flex-col gap-3">
                    <Link href={`/baustellen/${p.id}`} className="text-2xl font-semibold leading-tight underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                    {zeit && (
                      <p className="flex w-fit items-center gap-2 rounded-lg bg-sky-100 px-3 py-1.5 text-base font-medium text-sky-950">
                        <ClockIcon className="size-5" /> {zeit}
                      </p>
                    )}
                    {adresse && <p className="text-lg">{adresse}</p>}
                    {s.notiz && <p className="text-base text-muted-foreground">{s.notiz}</p>}
                    {navi && (
                      <a href={navi} target="_blank" rel="noopener noreferrer"
                        className={buttonVariants({ size: "touch", className: "w-full" })}>
                        <NavigationIcon />
                        Navigation starten
                      </a>
                    )}
                  </div>

                  {(kunde || bueroKontakt) && (
                    <div className="flex flex-col gap-2">
                      <p className="flex items-center gap-2 font-medium"><UserIcon className="size-5" /> Ansprechpartner</p>
                      <ul className="flex flex-col divide-y rounded-xl border">
                        {kunde && (
                          <li className="flex items-center justify-between gap-3 px-4 py-2">
                            <span>
                              <span className="block text-base">{kunde.ansprechpartner || kontaktName(kunde)}</span>
                              <span className="text-sm text-muted-foreground">Kunde{kunde.ansprechpartner ? ` · ${kontaktName(kunde)}` : ""}</span>
                            </span>
                            <AnrufLink nummer={kunde.mobil || kunde.telefon} name={kontaktName(kunde)} />
                          </li>
                        )}
                        {bueroKontakt && (
                          <li className="flex items-center justify-between gap-3 px-4 py-2">
                            <span>
                              <span className="block text-base">{bueroKontakt.vorname} {bueroKontakt.nachname}</span>
                              <span className="text-sm text-muted-foreground">Büro</span>
                            </span>
                            <AnrufLink nummer={bueroKontakt.telefon} name={bueroKontakt.vorname} />
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  <Link href={`/zeiten/neu?projekt=${p.id}`} className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}>
                    <ClockIcon />
                    Zeit eintragen
                  </Link>
                </section>
              );
            })}

            {/* Team */}
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-medium"><UsersIcon className="size-5" /> Heute dabei</p>
              <ul className="flex flex-col divide-y rounded-xl border">
                {team.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="text-base">
                      {k.vorname} {k.nachname}
                      {k.id === nutzer.id && <span className="text-muted-foreground"> (du)</span>}
                    </span>
                    {k.id !== nutzer.id && <AnrufLink nummer={k.telefon} name={k.vorname} />}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        );
      })}
    </div>
  );
}
