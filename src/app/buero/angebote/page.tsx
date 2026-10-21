import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDownIcon, PlusIcon, SparklesIcon } from "lucide-react";
import { BelegFilter } from "@/components/listen/beleg-filter";
import type { ListenOption } from "@/components/listen/mehrfach-liste";
import { StatusPille } from "@/components/status-pille";
import { buttonVariants } from "@/components/ui/button";
import { angeboteLaden } from "@/lib/angebot-daten";
import { STATUS_FILTER, angeboteFiltern, annahmeVon, istStatusFilterId, summe, versandVon } from "@/lib/angebot-liste";
import { requireBueroRecht } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatBetrag, formatDatum } from "@/lib/format";
import { istTag } from "@/lib/zeitraum";
import { AnnahmeWahl } from "./annahme-wahl";
import { dokumentTitel } from "@/lib/dokumentart";
import { AngebotZeilenMenue } from "./zeilen-menue";

export const metadata: Metadata = { title: "Angebote" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AngebotsListe({ searchParams }: PageProps<"/buero/angebote">) {
  await requireBueroRecht("angebote");
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const q = wert("q").trim();
  const archiv = wert("archiv") === "1";
  const netto = wert("netto") === "1";
  const aktiveProjekte = wert("aktiv") === "1";
  const status = wert("status").split(",").filter(istStatusFilterId);
  const projektIds = wert("projekt").split(",").filter((x) => UUID.test(x));
  const zeitraum = istTag(wert("von")) && istTag(wert("bis")) ? { von: wert("von"), bis: wert("bis") } : null;

  const { zeilen: alle } = await angeboteLaden({ q, archiv, limit: 1000 });
  const zeilen = angeboteFiltern(alle, { von: zeitraum?.von, bis: zeitraum?.bis, status, projektIds, nurAktiveProjekte: aktiveProjekte });
  const betrag = (z: (typeof zeilen)[number]) => (netto ? z.netto : z.brutto);

  const projektOptionen: ListenOption[] = [...new Map(alle.map((z) => [z.projektId, z])).values()]
    .sort((a, b) => a.projektName.localeCompare(b.projektName, "de"))
    .map((z) => ({ id: z.projektId, text: [z.projektnummer, z.projektName].filter(Boolean).join(" - ") }));
  const statusOptionen: ListenOption[] = STATUS_FILTER.map((s) => ({
    id: s.id,
    text: s.text,
    gruppe: s.gruppe,
    anzeige: <StatusPille name={s.text} farbe={s.farbe} />,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Angebote</h1>
        <Link href="/buero/angebote/neu" className={buttonVariants({ className: "h-8 px-3 text-[13px]" })}>
          <PlusIcon className="size-3.5 sm:hidden" /> Neues Dokument
        </Link>
      </div>

      <details className="group rounded-lg border bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] font-medium [&::-webkit-details-marker]:hidden">
          <SparklesIcon className="size-4 text-muted-foreground" />
          KI-Assistent
          <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">Beta</span>
          <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <p className="border-t px-3 py-3 text-[13px] text-muted-foreground">
          Hier kannst du später ein Angebot einsprechen oder eintippen, und die KI macht einen Entwurf zum Prüfen. Sie ist noch nicht eingeschaltet (sie kostet
          pro Nutzung, das entscheidet Ralf). Die Vorschau findest du im Angebot selbst.
        </p>
      </details>

      <BelegFilter
        q={q}
        platzhalter="Suche nach Betreff, Kunde, Projekt, …"
        zeitraum={zeitraum}
        heute={heuteIso()}
        status={status}
        statusOptionen={statusOptionen}
        projektIds={projektIds}
        projekte={projektOptionen}
        netto={netto}
        archiv={archiv}
        aktiveProjekte={aktiveProjekte}
      />

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs font-semibold">
              <th className="px-3 py-2.5">Angebot</th>
              <th className="hidden px-3 py-2.5 sm:table-cell">Datum</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Empfänger</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Versandstatus</th>
              <th className="px-3 py-2.5 text-right">Betrag {netto ? "netto" : "brutto"} €</th>
              <th className="px-3 py-2.5">Annahmestatus</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {zeilen.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">{alle.length ? "Keine Angebote mit diesen Filtern." : "Noch kein Angebot. Lege das erste mit „Neues Dokument“ an."}</td></tr>
            )}
            {zeilen.map((z) => (
              <tr key={z.id} className="relative border-b last:border-b-0 hover:bg-muted/40">
                <td className="max-w-80 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Link href={`/buero/angebote/${z.id}`} className="block min-w-0 truncate font-semibold after:absolute after:inset-0 after:content-['']">{z.betreff}</Link>
                    {z.status === "entwurf" && <StatusPille name="Entwurf" farbe="#6b7280" className="shrink-0" />}
                  </div>
                  <span className="block truncate text-xs text-muted-foreground">{[z.dokumentart !== "angebot" || z.nachtrag ? dokumentTitel(z.dokumentart, z.nachtrag, false) : "", z.projektnummer, z.projektName].filter(Boolean).join(" · ")}</span>
                </td>
                <td className="hidden px-3 py-2.5 whitespace-nowrap sm:table-cell">{formatDatum(z.datum)}</td>
                <td className="hidden max-w-48 truncate px-3 py-2.5 md:table-cell">{z.kunde || "–"}</td>
                <td className="hidden px-3 py-2.5 whitespace-nowrap lg:table-cell">
                  {versandVon(z.versendetAm, z.geoeffnetAm) === "geoeffnet" ? (
                    <>
                      <span className="block font-medium text-green-700">Geöffnet</span>
                      <span className="block text-xs text-muted-foreground">{formatDatum(z.geoeffnetAm!.slice(0, 10))}</span>
                    </>
                  ) : versandVon(z.versendetAm) === "gesendet" ? (
                    <>
                      <span className="block">Gesendet</span>
                      <span className="block text-xs text-muted-foreground">{formatDatum(z.versendetAm!.slice(0, 10))}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Nicht gesendet</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatBetrag(betrag(z))}</td>
                <td className="relative z-10 px-3 py-2.5"><AnnahmeWahl angebotId={z.id} aktuell={annahmeVon(z.status)} /></td>
                <td className="relative z-10 px-2 py-2.5"><AngebotZeilenMenue angebotId={z.id} archiviert={archiv} /></td>
              </tr>
            ))}
          </tbody>
          {zeilen.length > 0 && (
            <tfoot>
              <tr className="border-t text-xs">
                <td colSpan={4} className="px-3 py-2.5 text-muted-foreground">{zeilen.length} {zeilen.length === 1 ? "Angebot" : "Angebote"}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatBetrag(summe(zeilen.map(betrag)))}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
