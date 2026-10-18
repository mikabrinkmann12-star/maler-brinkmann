import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDaysIcon, ChevronRightIcon, FileTextIcon, MessageCircleIcon, PalmtreeIcon, ReceiptTextIcon, TruckIcon } from "lucide-react";
import { StatusPille } from "@/components/status-pille";
import { requireRole } from "@/lib/auth";
import { dashboardLaden } from "@/lib/dashboard-daten";
import { heuteIso } from "@/lib/datum";
import { formatBetrag, formatDatumLang, formatDatumZeit } from "@/lib/format";
import { wetterLaden } from "@/lib/wetter-daten";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { Hinweise } from "./hinweise";
import { MaterialMeldungen, type OffeneMeldung } from "./material-meldungen";

export const metadata: Metadata = { title: "Übersicht" };

const KASTEN = "flex flex-col gap-3 rounded-xl border p-4";

export default async function BueroUebersicht() {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const heute = heuteIso();
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
    dashboardLaden(heute),
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
  ].filter((a) => a.zahl > 0);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <p className="text-muted-foreground">{formatDatumLang(new Date())}</p>
        <p className="text-lg">Moin, {nutzer.vorname}!</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section className={KASTEN}>
          <h2 className="text-lg font-semibold">Zuletzt bearbeitete Projekte</h2>
          {d.zuletzt.length === 0 ? (
            <p className="text-muted-foreground">Noch keine Projekte.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {d.zuletzt.map((p) => (
                <li key={p.id}>
                  <Link href={`/baustellen/${p.id}`} className="flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/60">
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

        {wetter && (
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
        )}
      </div>

      <section className={KASTEN}>
        <h2 className="text-lg font-semibold">Zu erledigen</h2>
        {aufgaben.length === 0 && meldungen.length === 0 && (hinweise ?? []).length === 0 ? (
          <p className="text-muted-foreground">Nichts offen. 🎉</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
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

      <div className="grid gap-6 lg:grid-cols-2">
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
                      <span key={b.id}>{i > 0 && ", "}<Link href={`/baustellen/${b.id}`} className="underline-offset-2 hover:underline">{b.name}</Link></span>
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
      </div>

      <section className={KASTEN}>
        <h2 className="text-lg font-semibold">Angebote und Rechnungen</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/buero/angebote?status=versendet" className="flex flex-col rounded-lg border p-3 transition-colors hover:bg-muted">
            <span className="text-sm text-muted-foreground">Offene Angebote ({d.angebote.offenAnzahl})</span>
            <span className="text-xl font-semibold">{formatBetrag(d.angebote.offenNetto)}</span>
            <span className="text-xs text-muted-foreground">netto, versendet, ohne Antwort</span>
          </Link>
          <Link href="/buero/rechnungen" className="flex flex-col rounded-lg border p-3 transition-colors hover:bg-muted">
            <span className="text-sm text-muted-foreground">Offene Rechnungen ({d.rechnungen.offen.anzahl})</span>
            <span className="text-xl font-semibold">{formatBetrag(d.rechnungen.offen.summe)}</span>
            <span className="text-xs text-muted-foreground">brutto</span>
          </Link>
          <Link href="/buero/rechnungen" className={`flex flex-col rounded-lg border p-3 transition-colors hover:bg-muted ${d.rechnungen.ueberfaellig.anzahl > 0 ? "border-red-300 bg-red-50" : ""}`}>
            <span className="text-sm text-muted-foreground">Überfällig ({d.rechnungen.ueberfaellig.anzahl})</span>
            <span className={`text-xl font-semibold ${d.rechnungen.ueberfaellig.anzahl > 0 ? "text-red-700" : ""}`}>{formatBetrag(d.rechnungen.ueberfaellig.summe)}</span>
            <span className="text-xs text-muted-foreground">brutto, Zahlungsziel überschritten</span>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">Rechnungen: Stand vom letzten Abgleich mit Lexware (in der Rechnung „Aus Lexware abgleichen“).</p>
      </section>

      <Hinweise hinweise={hinweise ?? []} />
      <MaterialMeldungen meldungen={meldungen} />
    </div>
  );
}
