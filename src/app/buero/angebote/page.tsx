import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { STATUS_NAMEN, istAngebotStatus, type AngebotStatus } from "@/lib/angebot";
import { MAX_ANGEBOTE, angeboteLaden } from "@/lib/angebot-daten";
import { formatBetrag, formatDatum } from "@/lib/format";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { StatusBadge } from "./status-badge";

export const metadata: Metadata = { title: "Angebote" };

export default async function AngebotsListe({ searchParams }: PageProps<"/buero/angebote">) {
  await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const q = wert("q").trim();
  const archiv = wert("archiv") === "1";
  const status: AngebotStatus | "" = istAngebotStatus(wert("status")) ? (wert("status") as AngebotStatus) : "";

  const { zeilen, gesamt } = await angeboteLaden({ q, status, archiv });

  const adresse = (teil: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, archiv: archiv ? "1" : "", ...teil })) if (v) p.set(k, v);
    return `/buero/angebote${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Angebote</h1>
          <p className="text-sm text-muted-foreground">Ein Angebot gehört immer zu einem Projekt. Neue Angebote legst du hier oder im Projekt an.</p>
        </div>
        <Link href="/buero/angebote/neu" className={buttonVariants({ size: "lg" })}>
          <PlusIcon /> Neues Angebot
        </Link>
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        {archiv && <input type="hidden" name="archiv" value="1" />}
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={q} aria-label="Suchen" placeholder="Betreff, Projekt, Projektnummer, Kunde …"
            className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </div>
        <Button type="submit" size="lg">Suchen</Button>
        <Link href={adresse({ archiv: archiv ? "" : "1" })} className={buttonVariants({ variant: "ghost", size: "lg" })}>
          {archiv ? "Archiv schließen" : "Archiv"}
        </Link>
      </form>

      <div className="flex flex-wrap gap-2 text-sm" role="tablist" aria-label="Status">
        {[["", "Alle"], ...Object.entries(STATUS_NAMEN)].map(([s, name]) => (
          <Link key={s} href={adresse({ status: s })} role="tab" aria-selected={s === status}
            className={cn("flex h-9 items-center rounded-full border px-4", s === status ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {name}
          </Link>
        ))}
      </div>

      <section aria-labelledby="angebote-titel" className="flex flex-col gap-2">
        <h2 id="angebote-titel" className="text-lg font-semibold">
          {archiv ? "Archivierte Angebote" : "Angebote"}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{gesamt} {gesamt === 1 ? "Eintrag" : "Einträge"}</span>
        </h2>
        {zeilen.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
            {q || status || archiv ? "Nichts gefunden." : "Noch kein Angebot. Lege das erste mit „Neues Angebot“ an."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Betreff</th>
                  <th scope="col" className="px-3 py-2 font-medium">Projekt</th>
                  <th scope="col" className="px-3 py-2 font-medium">Kunde</th>
                  <th scope="col" className="px-3 py-2 font-medium">Datum</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Netto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {zeilen.map((z) => (
                  <tr key={z.id} className="hover:bg-muted/40">
                    <td className="max-w-80 px-4 py-2">
                      <Link href={`/buero/angebote/${z.id}`} className="block truncate font-medium hover:underline">{z.betreff}</Link>
                    </td>
                    <td className="max-w-56 px-3 py-2">
                      <Link href={`/baustellen/${z.projektId}`} className="block truncate hover:underline">{z.projektnummer}</Link>
                      <span className="block truncate text-xs text-muted-foreground">{z.projektName}</span>
                    </td>
                    <td className="max-w-48 truncate px-3 py-2">{z.kunde || "–"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDatum(z.datum)}</td>
                    <td className="px-3 py-2"><StatusBadge status={z.status} /></td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatBetrag(z.netto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {gesamt > MAX_ANGEBOTE && <p className="text-sm text-muted-foreground">Es werden die ersten {MAX_ANGEBOTE} gezeigt. Bitte genauer suchen.</p>}
      </section>
    </div>
  );
}
