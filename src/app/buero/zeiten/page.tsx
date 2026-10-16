import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, PlusIcon, XIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { heuteIso, istMonat, monatVerschieben } from "@/lib/datum";
import { formatMonat, formatStunden, formatTagKurz } from "@/lib/format";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { ZEIT_ARTEN, ZEIT_ART_NAMEN, uhrzeitKurz } from "@/lib/zeiten";
import {
  eintraegeFiltern,
  eintraegeSortieren,
  filterLesen,
  gesamtSumme,
  summenJePerson,
  vorkommendeArten,
} from "@/lib/zeiten-auswertung";
import { bueroPersonen, monatsEintraege, personenNamen } from "@/lib/zeiten-buero-daten";
import { Filterleiste } from "./filterleiste";

export const metadata: Metadata = { title: "Zeiten" };

export default async function BueroZeitenSeite({ searchParams }: PageProps<"/buero/zeiten">) {
  await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const dieserMonat = heuteIso().slice(0, 7);
  const monat = istMonat(params.monat) ? params.monat : dieserMonat;
  const filter = filterLesen(params);

  const [personen, alle] = await Promise.all([bueroPersonen(), monatsEintraege(monat)]);
  const namen = personenNamen(personen);
  const eintraege = eintraegeSortieren(eintraegeFiltern(alle, filter), namen);
  const summen = summenJePerson(eintraege, namen);
  const arten = vorkommendeArten(summen);
  const gesamt = gesamtSumme(summen);

  // Auswahllisten: Mitarbeiter (aktive + alle mit Zeiten in diesem Monat), Baustellen dieses Monats
  const mitZeiten = new Set(alle.map((e) => e.userId));
  const personenAuswahl = personen.filter((p) => p.aktiv || mitZeiten.has(p.id));
  const projekteAuswahl = [...new Map(alle.filter((e) => e.projektId).map((e) => [e.projektId!, e.projektName])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  const adresse = (pfad: string, teil: Record<string, string> = {}) => {
    const p = new URLSearchParams({ monat });
    for (const [k, v] of Object.entries({ person: filter.personId, projekt: filter.projektId, art: filter.art, ...teil })) {
      if (v) p.set(k, v);
    }
    return `${pfad}?${p}`;
  };
  const hatFilter = Boolean(filter.personId || filter.projektId || filter.art);

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Zeiten</h1>
          <p className="text-sm text-muted-foreground">
            {eintraege.length} {eintraege.length === 1 ? "Eintrag" : "Einträge"}{hatFilter && " (gefiltert)"} im {formatMonat(monat)}
          </p>
        </div>
        <Link
          href={`/buero/zeiten/neu${filter.personId ? `?person=${filter.personId}` : ""}`}
          className={buttonVariants({ size: "lg" })}
        >
          <PlusIcon /> Zeit nachtragen
        </Link>
      </div>

      {/* Monat wählen */}
      <div className="flex items-center gap-2">
        <Link href={adresse("/buero/zeiten", { monat: monatVerschieben(monat, -1) })} aria-label="Vormonat"
          className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
          <ChevronLeftIcon />
        </Link>
        <p className="min-w-40 text-center text-lg font-semibold">{formatMonat(monat)}</p>
        <Link href={adresse("/buero/zeiten", { monat: monatVerschieben(monat, 1) })} aria-label="Nächster Monat"
          className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
          <ChevronRightIcon />
        </Link>
        {monat !== dieserMonat && (
          <Link href={adresse("/buero/zeiten", { monat: dieserMonat })} className={buttonVariants({ variant: "ghost" })}>
            Dieser Monat
          </Link>
        )}
      </div>

      <Filterleiste
        monat={monat}
        personId={filter.personId}
        projektId={filter.projektId}
        art={filter.art}
        personen={personenAuswahl.map((p) => ({ id: p.id, name: p.aktiv ? p.name : `${p.name} (gesperrt)` }))}
        projekte={projekteAuswahl}
        arten={ZEIT_ARTEN.map((a) => ({ id: a, name: ZEIT_ART_NAMEN[a] }))}
      />
      {hatFilter && (
        <Link href={`/buero/zeiten?monat=${monat}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <XIcon className="size-4" /> Filter zurücksetzen
        </Link>
      )}

      {/* Summen */}
      <section className="flex flex-col gap-2" aria-labelledby="summen-titel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="summen-titel" className="text-lg font-semibold">Summen je Mitarbeiter</h2>
          <div className="flex flex-wrap gap-2">
            <a href={adresse("/buero/zeiten/export", { typ: "summen" })} download
              className={buttonVariants({ variant: "outline" })}>
              <DownloadIcon /> Summen als CSV
            </a>
            <a href={adresse("/buero/zeiten/export", { typ: "einzeln" })} download
              className={buttonVariants({ variant: "outline" })}>
              <DownloadIcon /> Alle Einträge als CSV
            </a>
          </div>
        </div>
        {summen.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-muted-foreground">Keine Zeiten gefunden.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Mitarbeiter</th>
                  {arten.map((a) => <th key={a} scope="col" className="px-3 py-2 text-right font-medium">{ZEIT_ART_NAMEN[a]}</th>)}
                  <th scope="col" className="px-4 py-2 text-right font-medium">Summe</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summen.map((s) => (
                  <tr key={s.userId}>
                    <th scope="row" className="px-4 py-2 font-medium">
                      <Link href={adresse("/buero/zeiten", { person: s.userId })} className="hover:underline">{s.name}</Link>
                    </th>
                    {arten.map((a) => (
                      <td key={a} className="px-3 py-2 text-right tabular-nums">{s.jeArt[a] ? formatStunden(s.jeArt[a]) : "–"}</td>
                    ))}
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatStunden(s.gesamt)}</td>
                  </tr>
                ))}
              </tbody>
              {summen.length > 1 && (
                <tfoot className="border-t bg-muted/50 font-semibold">
                  <tr>
                    <th scope="row" className="px-4 py-2">Gesamt</th>
                    {arten.map((a) => <td key={a} className="px-3 py-2 text-right tabular-nums">{formatStunden(gesamt.jeArt[a] ?? 0)}</td>)}
                    <td className="px-4 py-2 text-right tabular-nums">{formatStunden(gesamt.gesamt)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          „Summe“ zählt alle Arten zusammen. Soll-Stunden und Überstunden folgen im nächsten Schritt.
        </p>
      </section>

      {/* Einzelne Einträge */}
      {eintraege.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="eintraege-titel">
          <h2 id="eintraege-titel" className="text-lg font-semibold">Einträge</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Tag</th>
                  <th scope="col" className="px-3 py-2 font-medium">Mitarbeiter</th>
                  <th scope="col" className="px-3 py-2 font-medium">Zeit</th>
                  <th scope="col" className="px-3 py-2 font-medium">Baustelle</th>
                  <th scope="col" className="px-3 py-2 font-medium">Art</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Stunden</th>
                  <th scope="col" className="px-4 py-2"><span className="sr-only">Ändern</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {eintraege.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2 whitespace-nowrap">{formatTagKurz(t.datum)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{namen.get(t.userId) ?? "Unbekannt"}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {t.von ? `${uhrzeitKurz(t.von)}–${uhrzeitKurz(t.bis)}` : "–"}
                    </td>
                    <td className="max-w-64 truncate px-3 py-2">{t.projektName || "–"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{ZEIT_ART_NAMEN[t.art]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatStunden(t.stunden)}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/buero/zeiten/${t.id}`} className="font-medium text-primary hover:underline">Ändern</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
