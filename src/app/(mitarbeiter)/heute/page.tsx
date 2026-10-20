import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClockIcon, ClockIcon, HardHatIcon, MapPinIcon, MessageSquareTextIcon, NavigationIcon, TruckIcon, UserIcon, UsersIcon } from "lucide-react";
import { AnrufLink } from "@/components/anruf-link";
import { ContainerKarte } from "@/components/container-karte";
import { containerMeldungenLaden } from "@/lib/container-daten";
import { buttonVariants } from "@/components/ui/button";
import { ladeRechte, requireUser } from "@/lib/auth";
import { rechtOk } from "@/lib/rechte";
import { Wochenstreifen } from "@/components/wochenstreifen";
import { heuteIso, istIsoDatum } from "@/lib/datum";
import { stoppZeitText, stoppsSortieren } from "@/lib/einsatz";
import { einsaetzeVon, filterPersonen, gewaehltePersonen } from "@/lib/einsatz-personen";
import { formatStunden } from "@/lib/format";
import { kollegenLaden, meineEinsaetze } from "@/lib/mitarbeiter-daten";
import { initialen } from "@/lib/profil";
import { adresseText, kontaktName, mapsLink } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";
import { tagesTitel } from "@/lib/woche";
import { Warteschlange } from "../warteschlange";
import { PersonenFilter } from "./personen-filter";

export const metadata: Metadata = { title: "Einsätze" };

export default async function HeuteSeite({ searchParams }: PageProps<"/heute">) {
  const nutzer = await requireUser();
  const rechte = await ladeRechte();
  const zeigeEinsaetze = rechtOk(rechte, "einsaetze_ansehen");
  const zeigeTermine = rechtOk(rechte, "termine");
  const zeigeContainer = rechtOk(rechte, "container_melden");
  const heute = heuteIso();
  const { datum: datumParam, personen: personenRoh } = await searchParams;
  const datum = istIsoDatum(datumParam) ? datumParam : heute;
  const istHeute = datum === heute;
  const supabase = await createClient();
  const [einsaetze, kollegen, { data: heuteZeiten }, { data: termine }, containerMeldungen] = await Promise.all([
    zeigeEinsaetze ? meineEinsaetze(nutzer.id, datum) : Promise.resolve([]),
    kollegenLaden(),
    supabase.from("time_entries").select("stunden").eq("user_id", nutzer.id).eq("datum", heute).is("archiviert_am", null),
    // Eigene Termine heute (Büro/Admin sehen per RLS alle, hier immer nur die eigenen)
    zeigeTermine ? supabase
      .from("appointments")
      .select("id, titel, ort, zeit, notiz, project_id, appointment_members!inner(user_id)")
      .eq("datum", heute)
      .eq("appointment_members.user_id", nutzer.id)
      .is("archiviert_am", null)
      .order("zeit", { nullsFirst: false }) : Promise.resolve({ data: [] as { id: string; titel: string; ort: string | null; zeit: string | null; notiz: string | null; project_id: string | null }[] }),
    zeigeContainer ? containerMeldungenLaden() : Promise.resolve([]),
  ]);
  const heuteStunden = (heuteZeiten ?? []).reduce((s, t) => s + Number(t.stunden), 0);

  // Mitarbeiter-Filter: ich und meine Teamkollegen des Tages (mehr darf ich nie sehen, die Wahl wird gegen diese Liste geprüft)
  const ich = { id: nutzer.id, vorname: nutzer.vorname, nachname: nutzer.nachname };
  const personenListe = filterPersonen(ich, einsaetze, kollegen);
  const gewaehlt = gewaehltePersonen(personenRoh, personenListe, nutzer.id);

  const volleKarte = (e: (typeof einsaetze)[number]) => {
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

                  {datum <= heute && (
                    <Link href={`/zeiten/neu?projekt=${p.id}`} className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}>
                      <ClockIcon />
                      Zeit eintragen
                    </Link>
                  )}
                </section>
              );
            })}

            {/* Team */}
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-medium"><UsersIcon className="size-5" /> {istHeute ? "Heute dabei" : "Dabei"}</p>
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
  };

  /** Einsatz eines Teamkollegen: nur Auto und Baustellen (Navigation, Ansprechpartner und Team stehen in der Karte darüber). */
  const kompakteKarte = (e: (typeof einsaetze)[number]) => {
    const stopps = stoppsSortieren(e.assignment_stops);
    return (
      <article key={e.id} className="flex flex-col gap-3 rounded-2xl border p-4">
        <div className="flex items-center gap-2 text-base">
          <TruckIcon className="size-5 shrink-0" />
          <span className="font-semibold">{e.vehicles?.name ?? "Ohne Firmenwagen"}</span>
          {e.vehicles?.kennzeichen && <span className="text-muted-foreground">{e.vehicles.kennzeichen}</span>}
        </div>
        {stopps.length === 0 && <p className="text-muted-foreground">Noch keine Baustelle eingetragen.</p>}
        <ul className="flex flex-col gap-2">
          {stopps.map((s) => {
            if (!s.projects) return null;
            const zeit = stoppZeitText(s.zeit, s.zeit_art);
            return (
              <li key={s.id}>
                <Link href={`/baustellen/${s.projects.id}`} className="text-lg font-medium underline-offset-4 hover:underline">{s.projects.name}</Link>
                {zeit && <p className="text-sm text-muted-foreground">{zeit}</p>}
              </li>
            );
          })}
        </ul>
      </article>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Warteschlange userId={nutzer.id} />

      {zeigeContainer && <ContainerKarte meldungen={containerMeldungen} />}

      <Wochenstreifen gewaehlt={datum} heute={heute} hrefFuer={(d) => (d === heute ? "/heute" : `/heute?datum=${d}`)} />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{tagesTitel(datum, heute)}</h2>
        {personenListe.length > 1 && (
          <PersonenFilter
            personen={personenListe.map((k) => ({ id: k.id, name: `${k.vorname} ${k.nachname}`.trim(), initialen: initialen(k.vorname, k.nachname) }))}
            gewaehlt={gewaehlt}
            ichId={nutzer.id}
            datum={istIsoDatum(datumParam) ? datumParam : null}
          />
        )}
        {heuteZeiten && heuteZeiten.length > 0 && (
          <Link href="/zeiten" className="flex items-center gap-1 text-sm text-green-700 underline-offset-4 hover:underline">
            <ClockIcon className="size-4" /> Heute eingetragen: {formatStunden(heuteStunden)}
          </Link>
        )}
      </div>

      {(termine?.length ?? 0) > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sky-950">
          <h2 className="flex items-center gap-2 font-semibold"><CalendarClockIcon className="size-5" /> {istHeute ? "Termine heute" : "Termine"}</h2>
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

      {zeigeTermine && (
        <Link href="/termine/neu" className="flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
          <CalendarClockIcon className="size-4" /> Termin eintragen
        </Link>
      )}
      {!zeigeEinsaetze && <p className="rounded-xl border border-dashed p-4 text-muted-foreground">Die Einsatzplanung ist für dich nicht freigegeben.</p>}

      {gewaehlt.map((pid) => {
        const person = personenListe.find((k) => k.id === pid);
        if (!person) return null;
        const istIch = pid === nutzer.id;
        const seine = einsaetzeVon(einsaetze, pid);
        return (
          <section key={pid} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
                {initialen(person.vorname, person.nachname)}
              </span>
              <p className="font-semibold">{person.vorname} {person.nachname}{istIch && <span className="font-normal text-muted-foreground"> (du)</span>}</p>
            </div>
            {seine.length === 0 && !istIch && <p className="rounded-xl bg-muted px-4 py-3 text-muted-foreground">Keine Einsätze</p>}
            {seine.length === 0 && istIch && zeigeEinsaetze && (
        <div className="flex flex-col gap-3 rounded-xl border border-dashed p-5">
          <p className="text-lg font-medium">{istHeute ? "Für heute" : "Für diesen Tag"} bist du nicht eingeteilt.</p>
          <p className="text-muted-foreground">Frag im Büro nach oder schau bei deinen Projekten.</p>
          <Link href="/baustellen" className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}>
            <HardHatIcon />
            Meine Projekte
          </Link>
        </div>
            )}
            {seine.map((e) => (istIch ? volleKarte(e) : kompakteKarte(e)))}
          </section>
        );
      })}
    </div>
  );
}
