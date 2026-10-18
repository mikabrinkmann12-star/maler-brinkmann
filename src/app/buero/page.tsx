import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { CalendarDaysIcon, ChevronRightIcon, FileTextIcon, InboxIcon, MessageCircleIcon, PalmtreeIcon, ReceiptTextIcon, TruckIcon } from "lucide-react";
import { StatusPille } from "@/components/status-pille";
import { requireRole } from "@/lib/auth";
import { FORDERUNGS_STANDARD, istForderungsZeitraum } from "@/lib/dashboard";
import { LAYOUT_COOKIE, layoutLesen, type WidgetId } from "@/lib/dashboard-layout";
import { dashboardLaden } from "@/lib/dashboard-daten";
import { heuteIso } from "@/lib/datum";
import { formatBetrag, formatDatumLang, formatDatumZeit } from "@/lib/format";
import { wetterLaden } from "@/lib/wetter-daten";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { DashboardAnpassen } from "./dashboard-anpassen";
import { ForderungenZeitraum } from "./forderungen-zeitraum";
import { Hinweise } from "./hinweise";
import { MaterialMeldungen, type OffeneMeldung } from "./material-meldungen";

export const metadata: Metadata = { title: "Übersicht" };

const KASTEN = "flex flex-col gap-3 rounded-xl border p-4";

export default async function BueroUebersicht({ searchParams }: PageProps<"/buero">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const heute = heuteIso();
  const zeitraum = istForderungsZeitraum(params.forderungen) ? params.forderungen : FORDERUNGS_STANDARD;
  const layout = layoutLesen((await cookies()).get(LAYOUT_COOKIE)?.value);
  const supabase = await createClient();
  const [{ data: hinweise }, { data: material }, kollegen, d, wetter] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, typ, text, project_id, created_at")
      .is("gelesen_am", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("material_usage")
      .select("id, material, menge, einheit, bemerkung, project_id, erstellt_von, created_at, projects(name)")
      .is("erledigt_am", null)
      .is("archiviert_am", null)
      .order("created_at", { ascending: false })
      .limit(50),
    kollegenLaden(),
    dashboardLaden(heute, zeitraum),
    wetterLaden(),
  ]);
  const meldungen: OffeneMeldung[] = (material ?? []).map((m) => ({
    id: m.id,
    material: m.material,
    menge: Number(m.menge),
    einheit: m.einheit,
    bemerkung: m.bemerkung,
    projektId: m.project_id,
    projektName: m.projects?.name ?? "Baustelle",
    wer: (m.erstellt_von && kollegen.get(m.erstellt_von)?.vorname) || "Ehemaliger Kollege",
    created_at: m.created_at,
  }));

  const aufgaben = [
    { href: "/buero/urlaub", icon: PalmtreeIcon, text: "Urlaubsanträge offen", zahl: d.aufgaben.urlaubsantraege },
    { href: "/buero/projekte", icon: MessageCircleIcon, text: `Neue Chat-Nachrichten${d.aufgaben.chat.projekte > 1 ? ` in ${d.aufgaben.chat.projekte} Projekten` : ""}`, zahl: d.aufgaben.chat.nachrichten },
    { href: "/buero/rechnungen?status=entwurf", icon: ReceiptTextIcon, text: "Rechnungsentwürfe", zahl: d.rechnungen.entwuerfe },
    { href: "/buero/angebote?status=entwurf", icon: FileTextIcon, text: "Angebotsentwürfe", zahl: d.angebote.entwuerfe },
    { href: "/buero/eingangsrechnungen?tab=pruefen", icon: InboxIcon, text: "Eingangsrechnungen zu prüfen", zahl: d.aufgaben.eingangPruefen },
  ].filter((a) => a.zahl > 0);

  const f = d.rechnungen.forderungen;
  const prozent = (teil: number) => (f.gesamt.summe > 0 ? Math.round((teil / f.gesamt.summe) * 100) : 0);
  const anteilAngemahnt = prozent(f.angemahnt.summe);
  const anteilUeberfaellig = prozent(f.ueberfaellig.summe);

  const widgets: Record<WidgetId, ReactNode> = {
    zuletzt: (
      <section className={KASTEN}>
        <h2 className="text-lg font-semibold">Zuletzt bearbeitete Projekte</h2>
        {d.zuletzt.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Projekte.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {d.zuletzt.map((p) => (
              <li key={p.id}>
                <Link href={`/buero/projekte/${p.id}`} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-sm text-muted-foreground">{[p.projektnummer, p.kunde].filter(Boolean).join(" · ")}</span>
                  </span>
                  {p.status && <StatusPille name={p.status.name} farbe={p.status.farbe} className="hidden sm:inline-flex" />}
                  <span className="hidden shrink-0 text-xs text-muted-foreground md:block">{formatDatumZeit(p.bearbeitet)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/buero/projekte" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
          Alle Projekte <ChevronRightIcon className="size-4" />
        </Link>
      </section>
    ),

    forderungen: (
      <section className={KASTEN}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">Offene Forderungen</h2>
          <ForderungenZeitraum aktuell={zeitraum} />
        </div>
        <p className="text-3xl font-semibold tabular-nums">{formatBetrag(f.gesamt.summe)}</p>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${anteilUeberfaellig} % der offenen Forderungen sind überfällig, ${anteilAngemahnt} % angemahnt`}>
          <div className="h-full bg-blue-500" style={{ width: `${f.gesamt.summe > 0 ? 100 - anteilUeberfaellig - anteilAngemahnt : 0}%` }} />
          <div className="h-full bg-amber-400" style={{ width: `${anteilUeberfaellig}%` }} />
          <div className="h-full bg-red-500" style={{ width: `${anteilAngemahnt}%` }} />
        </div>
        <ul className="flex flex-col gap-1.5 text-sm">
          {[
            { name: "Offen", punkt: "bg-blue-500", rot: false, summe: f.offen.summe, anzahl: f.offen.anzahl },
            { name: "Überfällig", punkt: "bg-amber-400", rot: false, summe: f.ueberfaellig.summe, anzahl: f.ueberfaellig.anzahl },
            { name: "Angemahnt", punkt: "bg-red-500", rot: true, summe: f.angemahnt.summe, anzahl: f.angemahnt.anzahl },
          ].map((z) => (
            <li key={z.name} className={`flex items-center gap-2 ${z.rot && z.anzahl > 0 ? "text-red-600" : ""}`}>
              <span className={`size-2.5 rounded-full ${z.punkt}`} />
              <span className={`flex-1 ${z.rot ? "font-medium" : ""}`}>{z.name}</span>
              <span className="font-semibold tabular-nums">{formatBetrag(z.summe)}</span>
              <span className={`flex size-5 items-center justify-center rounded-full text-[11px] font-medium ${z.rot && z.anzahl > 0 ? "bg-red-100 text-red-700" : "bg-muted"}`}>{z.anzahl}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">Brutto, nach Rechnungsdatum im gewählten Zeitraum. Stand vom letzten Abgleich mit Lexware. „Angemahnt“ vermerkt das Büro in der Rechnung (die Mahnungen selbst laufen in Lexware).</p>
        <Link href="/buero/rechnungen" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
          Alle Rechnungen anzeigen <ChevronRightIcon className="size-4" />
        </Link>
      </section>
    ),

    einsatz: (
      <section className={KASTEN}>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><TruckIcon className="size-5" /> Heute im Einsatz</h2>
        {d.heuteImEinsatz.length === 0 ? (
          <p className="text-muted-foreground">Heute ist noch nichts eingeteilt.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {d.heuteImEinsatz.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                <span className="font-medium">{e.auto}</span>
                <span className="text-sm">
                  {e.baustellen.length === 0 ? "Keine Baustelle" : e.baustellen.map((b, i) => (
                    <span key={b.id}>{i > 0 && ", "}<Link href={`/buero/projekte/${b.id}`} className="underline-offset-2 hover:underline">{b.name}</Link></span>
                  ))}
                </span>
                <span className="text-sm text-muted-foreground">{e.team.join(", ") || "Niemand eingeteilt"}</span>
              </li>
            ))}
          </ul>
        )}
        {d.abwesend.length > 0 && (
          <p className="border-t pt-2 text-sm">
            <span className="font-medium">Abwesend:</span> {d.abwesend.map((a) => `${a.name} (${a.grund})`).join(", ")}
          </p>
        )}
        <Link href={`/buero/plantafel?datum=${heute}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
          <CalendarDaysIcon className="size-4" /> Zur Einteilung
        </Link>
      </section>
    ),

    projektstatus: (
      <section className={KASTEN}>
        <h2 className="text-lg font-semibold">Projekte nach Status</h2>
        {d.projekte.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Projekte.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {d.projekte.map((s) => (
              <li key={s.id}>
                <Link href={`/buero/projekte?status=${s.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted">
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: s.farbe }} />
                  <span className="flex-1">{s.name}</span>
                  <span className="font-semibold">{s.anzahl}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),

    angebote: (
      <section className={KASTEN}>
        <h2 className="text-lg font-semibold">Offene Angebote</h2>
        <Link href="/buero/angebote?status=fertig,ausstehend" className="flex flex-col rounded-lg border p-3 transition-colors hover:bg-muted">
          <span className="text-sm text-muted-foreground">{d.angebote.offenAnzahl} {d.angebote.offenAnzahl === 1 ? "Angebot" : "Angebote"} ohne Antwort</span>
          <span className="text-xl font-semibold">{formatBetrag(d.angebote.offenNetto)}</span>
          <span className="text-xs text-muted-foreground">netto, versendet</span>
        </Link>
      </section>
    ),

    wetter: wetter ? (
      <section className={KASTEN}>
        <h2 className="text-lg font-semibold">Wetter</h2>
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>{wetter.symbol}</span>
          <div>
            <p className="text-3xl font-semibold">{wetter.grad} °C</p>
            <p className="text-sm text-muted-foreground">{wetter.ort} · {wetter.text}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Heute: {wetter.minGrad} °C bis {wetter.maxGrad} °C</p>
        {wetter.stunden.length > 0 && (
          <ul className="grid grid-cols-5 gap-1 border-t pt-3 text-center text-xs text-muted-foreground">
            {wetter.stunden.map((h) => (
              <li key={h.uhrzeit} className="flex flex-col items-center gap-0.5">
                <span>{h.uhrzeit}</span>
                <span className="text-base" title={h.text}>{h.symbol}</span>
                <span className="font-medium text-foreground">{h.grad}°</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    ) : null,

    aufgaben: (
      <section className={KASTEN}>
        <h2 className="text-lg font-semibold">Zu erledigen</h2>
        {aufgaben.length === 0 ? (
          <p className="text-muted-foreground">Nichts offen. 🎉</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {aufgaben.map((a) => (
              <li key={a.text}>
                <Link href={a.href} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted">
                  <a.icon className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">{a.text}</span>
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground">{a.zahl}</span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),

    hinweise: <Hinweise hinweise={hinweise ?? []} />,
    material: <MaterialMeldungen meldungen={meldungen} />,
  };

  const spalte = (ids: WidgetId[]) => ids.map((id) => widgets[id] && <div key={id}>{widgets[id]}</div>);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <p className="text-muted-foreground">{formatDatumLang(new Date())}</p>
        <p className="text-lg">Moin, {nutzer.vorname}!</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">{spalte(layout.links)}</div>
        <div className="flex min-w-0 flex-col gap-6">{spalte(layout.rechts)}</div>
      </div>

      <div className="flex justify-end">
        <DashboardAnpassen layout={layout} />
      </div>
    </div>
  );
}
