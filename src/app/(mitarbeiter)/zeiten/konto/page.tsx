import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { ZeitenReiter } from "@/components/layout/zeiten-reiter";
import { requireUser } from "@/lib/auth";
import { heuteIso, istIsoDatum, tageVerschieben } from "@/lib/datum";
import { formatDatum, formatStunden, formatStundenSaldo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { periodenBilanz, sollAufloesen, standardSoll, type KontoEintrag, type SollEinstellung } from "@/lib/ueberstunden";
import { kontenLaden } from "@/lib/ueberstunden-daten";
import { urlaubskonto } from "@/lib/urlaub";
import { kalenderwoche } from "@/lib/kalenderwoche";
import { wochenstart, wochenTitel } from "@/lib/woche";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";

export const metadata: Metadata = { title: "Stundenkonto" };

// Reiter „Stundenkonto“: Stundenbilanz der Woche, Arbeitszeitkonto (Überstunden) und Urlaub des Jahres.
export default async function StundenkontoSeite({ searchParams }: PageProps<"/zeiten/konto">) {
  const nutzer = await requireUser();
  const { woche } = await searchParams;
  const heute = heuteIso();
  const anker = istIsoDatum(woche) && woche <= heute ? woche : heute;
  const montag = wochenstart(anker);
  const sonntag = tageVerschieben(montag, 6);
  const jahr = Number(heute.slice(0, 4));

  const supabase = await createClient();
  const [einstellungen, { data: profil }, { data: zeiten }, { data: antraege }, konten] = await Promise.all([
    zeiterfassungEinstellungen(),
    supabase.from("profiles").select("soll_mo, soll_di, soll_mi, soll_do, soll_fr, urlaubstage_jahr").eq("id", nutzer.id).maybeSingle(),
    supabase
      .from("time_entries")
      .select("datum, art, stunden")
      .eq("user_id", nutzer.id)
      .is("archiviert_am", null)
      .gte("datum", montag)
      .lte("datum", sonntag),
    supabase.from("leave_requests").select("von, bis, art, status").eq("user_id", nutzer.id),
    kontenLaden({ monat: heute.slice(0, 7), userIds: [nutzer.id] }), // immer nur das eigene Konto
  ]);

  const soll = sollAufloesen(
    [profil?.soll_mo, profil?.soll_di, profil?.soll_mi, profil?.soll_do, profil?.soll_fr].map((x) => (x == null ? null : Number(x))) as SollEinstellung,
    standardSoll(einstellungen),
  );
  const eintraege: KontoEintrag[] = (zeiten ?? []).map((t) => ({ datum: t.datum, art: t.art, stunden: Number(t.stunden) }));
  const bilanz = periodenBilanz(montag, sonntag, soll, eintraege);
  const anteil = bilanz.soll > 0 ? Math.min(100, Math.round((bilanz.ist / bilanz.soll) * 100)) : bilanz.ist > 0 ? 100 : 0;
  const konto = konten.get(nutzer.id);
  const urlaub = urlaubskonto(profil?.urlaubstage_jahr ?? null, antraege ?? [], jahr);

  const kw = kalenderwoche(montag);
  const link = (a: string) => (a === heute ? "/zeiten/konto" : `/zeiten/konto?woche=${a}`);
  const vor = tageVerschieben(sonntag, 1);
  const pfeil = "flex size-12 items-center justify-center rounded-full hover:bg-muted";
  const KARTE = "flex flex-col gap-2 rounded-xl border bg-card p-4";

  return (
    <div className="flex flex-col gap-4">
      <ZeitenReiter aktiv="konto" />

      <div className="grid grid-cols-[3rem_1fr_3rem] items-center">
        <Link href={link(tageVerschieben(montag, -1))} aria-label="Vorherige Woche" className={pfeil}>
          <ChevronLeftIcon className="size-6" />
        </Link>
        <p className="text-center">
          <span className="font-semibold">KW {kw}</span>
          <span className="ml-2 text-muted-foreground">{wochenTitel(montag)}</span>
        </p>
        {vor <= heute ? (
          <Link href={link(vor)} aria-label="Nächste Woche" className={pfeil}>
            <ChevronRightIcon className="size-6" />
          </Link>
        ) : (
          <span className="size-12" />
        )}
      </div>

      <section className={KARTE}>
        <h2 className="font-semibold">Stundenbilanz</h2>
        <p className="text-3xl font-semibold">{formatStunden(bilanz.ist)}</p>
        <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={anteil} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${anteil}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">{formatStunden(bilanz.ist)} von {formatStunden(bilanz.soll)}</p>
      </section>

      {konto ? (
        <section className={KARTE}>
          <h2 className="font-semibold">Arbeitszeitkonto</h2>
          <p className={`text-3xl font-semibold ${konto.stand < 0 ? "text-red-600" : ""}`}>{formatStundenSaldo(konto.stand)}</p>
          <p className="text-sm text-muted-foreground">Stand bis gestern, seit dem {formatDatum(konto.kontoAb)}. Feiertage und Wochenenden zählen nicht.</p>
          <p className="text-sm text-muted-foreground">KW {kw}: Differenz {formatStundenSaldo(bilanz.differenz)}</p>
        </section>
      ) : (
        <section className={KARTE}>
          <h2 className="font-semibold">Arbeitszeitkonto</h2>
          <p className="text-sm text-muted-foreground">Für dich ist noch kein Überstundenkonto eingerichtet (im Büro nachfragen).</p>
        </section>
      )}

      <section className={KARTE}>
        <h2 className="font-semibold">Urlaub {urlaub.jahr}</h2>
        {urlaub.anspruch == null ? (
          <p className="text-sm text-muted-foreground">Anspruch noch nicht eingetragen (im Büro nachfragen).</p>
        ) : (
          <>
            <p className="text-3xl font-semibold">{urlaub.genehmigt} <span className="text-lg font-normal text-muted-foreground">von {urlaub.anspruch} Tagen genommen</span></p>
            <p className="text-sm text-muted-foreground">
              Rest {urlaub.rest} Tage{urlaub.beantragt > 0 ? ` · ${urlaub.beantragt} beantragt (noch offen)` : ""}
            </p>
          </>
        )}
        <Link href="/urlaub" className="text-sm font-medium text-primary underline underline-offset-4">Urlaubsanträge ansehen</Link>
      </section>
    </div>
  );
}
