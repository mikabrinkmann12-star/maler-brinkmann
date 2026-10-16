import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveIcon, ArrowLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDatum } from "@/lib/format";
import { adresseText } from "@/lib/projekt";
import { projekteSuchen } from "@/lib/projekt-liste";

export const metadata: Metadata = { title: "Archiv" };

/** Alle archivierten Projekte: für alle Mitarbeiter lesbar (zum Nachschauen, z. B. welche Farbe verwendet wurde). */
export default async function ArchivSeite({ searchParams }: PageProps<"/baustellen/archiv">) {
  await requireUser();
  const { q } = await searchParams;
  const suche = typeof q === "string" ? q : "";
  const { projekte, gesamt } = await projekteSuchen({ q: suche, archiv: true, sortierung: "geaendert", limit: 100 });

  return (
    <div className="flex flex-col gap-5">
      <Link href="/baustellen" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Meine Baustellen
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ArchiveIcon className="size-6" /> Archiv</h1>
        <p className="text-muted-foreground">Abgeschlossene Baustellen zum Nachschauen. Hier kannst du nur lesen.</p>
      </div>

      <form role="search" className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={suche} placeholder="Kunde, Straße, Ort, Projekt …" aria-label="Archiv durchsuchen"
            className="h-12 w-full rounded-lg border border-input bg-transparent pr-3 pl-10 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </div>
        <Button type="submit" size="touch">Suchen</Button>
      </form>

      <p className="text-sm text-muted-foreground">{gesamt} {gesamt === 1 ? "Projekt" : "Projekte"}{suche && ` für „${suche}“`}</p>
      {projekte.length === 0 && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">Nichts gefunden.</p>}
      <ul className="flex flex-col gap-3">
        {projekte.map((p) => (
          <li key={p.id}>
            <Link href={`/baustellen/${p.id}`} className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-medium">{p.name}</span>
                {p.kunde && <span className="block truncate text-sm">{p.kunde}</span>}
                <span className="block truncate text-sm text-muted-foreground">
                  {adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort }) || "Keine Adresse"}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {p.status?.name}
                  {p.start_datum && ` · ${formatDatum(p.start_datum)}–${formatDatum(p.end_datum)}`}
                </span>
              </span>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {gesamt > 100 && <p className="text-sm text-muted-foreground">Es werden die ersten 100 gezeigt. Bitte genauer suchen.</p>}
    </div>
  );
}
