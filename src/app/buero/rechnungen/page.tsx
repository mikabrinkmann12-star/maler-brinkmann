import type { Metadata } from "next";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatBetrag, formatDatum } from "@/lib/format";
import { RECHNUNG_STATUS_NAMEN, type RechnungStatus } from "@/lib/rechnung";
import { MAX_RECHNUNGEN, rechnungenLaden } from "@/lib/rechnung-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { RechnungStatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Rechnungen" };

const STATUS: RechnungStatus[] = ["entwurf", "uebertragen"];

export default async function RechnungsListe({ searchParams }: PageProps<"/buero/rechnungen">) {
  await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const q = wert("q").trim();
  const archiv = wert("archiv") === "1";
  const status: RechnungStatus | "" = STATUS.includes(wert("status") as RechnungStatus) ? (wert("status") as RechnungStatus) : "";

  const { zeilen, gesamt } = await rechnungenLaden({ q, status, archiv });

  const adresse = (teil: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, archiv: archiv ? "1" : "", ...teil })) if (v) p.set(k, v);
    return `/buero/rechnungen${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Rechnungen</h1>
        <p className="text-sm text-muted-foreground">
          Eine Rechnung entsteht aus einem Angebot („Rechnung erstellen“ im Angebot). Die Rechnungsnummer und das PDF kommen von Lexware Office.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        {archiv && <input type="hidden" name="archiv" value="1" />}
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={q} aria-label="Suchen" placeholder="Rechnungsnummer, Betreff, Projekt, Kunde …"
            className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </div>
        <Button type="submit" size="lg">Suchen</Button>
        <Link href={adresse({ archiv: archiv ? "" : "1" })} className={buttonVariants({ variant: "ghost", size: "lg" })}>{archiv ? "Archiv schließen" : "Archiv"}</Link>
      </form>

      <div className="flex flex-wrap gap-2 text-sm" role="tablist" aria-label="Status">
        {[["", "Alle"], ...STATUS.map((s) => [s, s === "uebertragen" ? "Bei Lexware" : RECHNUNG_STATUS_NAMEN[s]])].map(([s, name]) => (
          <Link key={s} href={adresse({ status: s })} role="tab" aria-selected={s === status}
            className={cn("flex h-9 items-center rounded-full border px-4", s === status ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {name}
          </Link>
        ))}
      </div>

      <section aria-labelledby="rechnungen-titel" className="flex flex-col gap-2">
        <h2 id="rechnungen-titel" className="text-lg font-semibold">
          {archiv ? "Archivierte Rechnungen" : "Rechnungen"}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{gesamt} {gesamt === 1 ? "Eintrag" : "Einträge"}</span>
        </h2>
        {zeilen.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
            {q || status || archiv ? "Nichts gefunden." : "Noch keine Rechnung. Öffne ein Angebot und tippe auf „Rechnung erstellen“."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Nummer</th>
                  <th scope="col" className="px-3 py-2 font-medium">Betreff</th>
                  <th scope="col" className="px-3 py-2 font-medium">Projekt</th>
                  <th scope="col" className="px-3 py-2 font-medium">Kunde</th>
                  <th scope="col" className="px-3 py-2 font-medium">Datum</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Brutto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {zeilen.map((z) => (
                  <tr key={z.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2 whitespace-nowrap"><Link href={`/buero/rechnungen/${z.id}`} className="font-medium hover:underline">{z.rechnungsnummer || "Entwurf"}</Link></td>
                    <td className="max-w-64 truncate px-3 py-2">{z.betreff}</td>
                    <td className="max-w-48 px-3 py-2"><Link href={`/baustellen/${z.projektId}`} className="block truncate hover:underline">{z.projektnummer}</Link><span className="block truncate text-xs text-muted-foreground">{z.projektName}</span></td>
                    <td className="max-w-48 truncate px-3 py-2">{z.kunde || "–"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDatum(z.rechnungsdatum)}</td>
                    <td className="px-3 py-2"><RechnungStatusBadge status={z.status} lexwareStatus={z.lexwareStatus} /></td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatBetrag(z.brutto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {gesamt > MAX_RECHNUNGEN && <p className="text-sm text-muted-foreground">Es werden die ersten {MAX_RECHNUNGEN} gezeigt. Bitte genauer suchen.</p>}
      </section>
    </div>
  );
}
