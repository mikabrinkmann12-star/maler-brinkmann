import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "cn";
import { darf, requireBueroRecht } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatBetrag, formatDatum, formatStunden } from "@/lib/format";
import { KOSTENARTEN, KOSTENART_NAMEN } from "@/lib/kalkulation";
import { prozentVonSoll } from "@/lib/nachkalkulation";
import { nachkalkulationLaden } from "@/lib/nachkalkulation-daten";
import { createClient } from "@/lib/supabase/server";
import { KostenBereich } from "./kosten-bereich";

export const metadata: Metadata = { title: "Nachkalkulation" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_NAMEN: Record<string, string> = { angenommen: "angenommen", versendet: "versendet", entwurf: "Entwurf" };
const prozent = (p: number | null) => (p === null ? "–" : `${p.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);

/** Ring wie in Plancraft: Anteil der Ist-Stunden an den Soll-Stunden (über 100 % rot). */
function Ring({ wert }: { wert: number | null }) {
  const anteil = Math.min(100, Math.max(0, wert ?? 0));
  const farbe = (wert ?? 0) > 100 ? "#dc2626" : "#2e9e5b";
  return (
    <div
      className="flex size-20 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${farbe} ${anteil * 3.6}deg, #e5e7eb 0)` }}
      role="img"
      aria-label={wert === null ? "Kein Soll" : `${prozent(wert)} der Soll-Stunden`}
    >
      <div className="flex size-[68px] items-center justify-center rounded-full bg-white text-sm font-semibold tabular-nums">{wert === null ? "–" : `${Math.round(wert)} %`}</div>
    </div>
  );
}

export default async function NachkalkulationSeite({ params }: PageProps<"/buero/projekte/[id]/nachkalkulation">) {
  await requireBueroRecht("projekte_ansehen");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: projekt } = await supabase.from("projects").select("id, name, projektnummer").eq("id", id).maybeSingle();
  if (!projekt) notFound();

  const n = await nachkalkulationLaden(id);
  const darfErfassen = await darf("projekte_bearbeiten");
  const stundenProzent = prozentVonSoll(n.ist.stunden, n.soll.stunden);
  const kostenProzent = prozentVonSoll(n.ist.kostenGesamt, n.soll.kostenGesamt);
  const box = "rounded-lg border bg-white p-4";

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div>
        <Link href={`/buero/projekte/${id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" /> Zurück zum Projekt
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Nachkalkulation</h1>
        <p className="text-sm text-muted-foreground">{projekt.projektnummer} · {projekt.name}</p>
      </div>

      <p className="rounded-lg bg-muted/60 px-4 py-3 text-[13px]">
        {n.angebot ? (
          <>
            Grundlage für das Soll: <Link href={`/buero/angebote/${n.angebot.id}`} className="font-medium underline">{n.angebot.betreff}</Link> ({STATUS_NAMEN[n.angebot.status] ?? n.angebot.status}, {formatDatum(n.angebot.datum)}).{" "}
            {n.soll.kalkuliert + n.soll.unkalkuliert > 0 && <>{n.soll.kalkuliert} von {n.soll.kalkuliert + n.soll.unkalkuliert} Positionen sind kalkuliert; nur für diese gibt es Soll-Stunden und Soll-Kosten.</>}
          </>
        ) : (
          <>Dieses Projekt hat noch kein Angebot. Ohne Angebot gibt es kein Soll und keinen Erlös, die Ist-Werte stehen trotzdem unten.</>
        )}
        {n.einstellungenFehlen && <> Die Kalkulation (Lohnkosten) darfst du nicht ansehen, es gelten Startwerte.</>}
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <section className={cn(box, "flex items-center gap-4")} aria-label="Arbeitsstunden">
          <Ring wert={stundenProzent} />
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Arbeitsstunden</p>
            <p className="text-xl font-semibold tabular-nums">{formatStunden(n.ist.stunden)}</p>
            <p className="text-xs text-muted-foreground">Soll {formatStunden(n.soll.stunden)}</p>
          </div>
        </section>
        <section className={box} aria-label="Erlös">
          <p className="text-[13px] text-muted-foreground">Erlös laut Angebot (netto)</p>
          <p className="text-xl font-semibold tabular-nums">{formatBetrag(n.ergebnis.erlos)}</p>
        </section>
        <section className={box} aria-label="Kosten">
          <p className="text-[13px] text-muted-foreground">Kosten Ist</p>
          <p className={cn("text-xl font-semibold tabular-nums", (kostenProzent ?? 0) > 100 && "text-destructive")}>{formatBetrag(n.ist.kostenGesamt)}</p>
          <p className="text-xs text-muted-foreground">Soll {formatBetrag(n.soll.kostenGesamt)} · {prozent(kostenProzent)}</p>
        </section>
        <section className={box} aria-label="Ertrag">
          <p className="text-[13px] text-muted-foreground">Ertrag bisher</p>
          <p className={cn("text-xl font-semibold tabular-nums", n.ergebnis.ertrag < 0 && "text-destructive")}>{formatBetrag(n.ergebnis.ertrag)}</p>
          <p className="text-xs text-muted-foreground">{prozent(n.ergebnis.ertragProzent)} vom Erlös · geplant {formatBetrag(n.ergebnis.sollErtrag)}</p>
        </section>
      </div>

      <section className="overflow-x-auto rounded-lg border bg-white" aria-label="Soll und Ist je Kostenart">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs font-semibold">
              <th className="px-3 py-2.5">Kostenart</th>
              <th className="px-3 py-2.5 text-right">Soll</th>
              <th className="px-3 py-2.5 text-right">Ist</th>
              <th className="px-3 py-2.5 text-right">Abweichung</th>
              <th className="px-3 py-2.5 text-right">Ist vom Soll</th>
            </tr>
          </thead>
          <tbody>
            {KOSTENARTEN.map((a) => {
              const soll = n.soll.kosten[a];
              const ist = n.ist.kosten[a];
              const diff = Math.round((ist - soll) * 100) / 100;
              return (
                <tr key={a} className="border-b last:border-b-0">
                  <td className="px-3 py-2.5 font-medium">
                    {KOSTENART_NAMEN[a]}
                    {a === "lohn" && n.ist.lohnkostenProStunde !== null && <span className="block text-xs font-normal text-muted-foreground">Ist: Stunden × {formatBetrag(n.ist.lohnkostenProStunde)} Lohnkosten</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatBetrag(soll)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatBetrag(ist)}</td>
                  <td className={cn("px-3 py-2.5 text-right tabular-nums", diff > 0 && "text-destructive")}>{diff > 0 ? "+" : ""}{formatBetrag(diff)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{prozent(prozentVonSoll(ist, soll))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t text-[13px] font-semibold">
              <td className="px-3 py-2.5">Gesamtkosten</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatBetrag(n.soll.kostenGesamt)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatBetrag(n.ist.kostenGesamt)}</td>
              <td className={cn("px-3 py-2.5 text-right tabular-nums", n.ist.kostenGesamt > n.soll.kostenGesamt && "text-destructive")}>
                {n.ist.kostenGesamt > n.soll.kostenGesamt ? "+" : ""}{formatBetrag(Math.round((n.ist.kostenGesamt - n.soll.kostenGesamt) * 100) / 100)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{prozent(kostenProzent)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <KostenBereich projektId={id} heute={heuteIso()} kosten={n.kosten} eingangsrechnungen={n.eingangsrechnungen} darfErfassen={darfErfassen} />
    </div>
  );
}
