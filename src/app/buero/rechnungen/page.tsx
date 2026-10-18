import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { BelegFilter } from "@/components/listen/beleg-filter";
import type { ListenOption } from "@/components/listen/mehrfach-liste";
import { StatusPille } from "@/components/status-pille";
import { summe } from "@/lib/angebot-liste";
import { requireRole } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatBetrag, formatDatum } from "@/lib/format";
import {
  RECHNUNG_ANZEIGE_FARBEN,
  RECHNUNG_ANZEIGE_NAMEN,
  anzeigeStatus,
  faelligText,
  istRechnungAnzeigeStatus,
  offenerBetrag,
  rechnungenFiltern,
  type RechnungAnzeigeStatus,
} from "@/lib/rechnung-liste";
import { rechnungenLaden } from "@/lib/rechnung-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { istTag } from "@/lib/zeitraum";

export const metadata: Metadata = { title: "Ausgangsrechnungen" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILTER_STATUS: RechnungAnzeigeStatus[] = ["entwurf", "offen", "ueberfaellig", "angemahnt", "bezahlt", "storniert"];

export default async function RechnungsListe({ searchParams }: PageProps<"/buero/rechnungen">) {
  await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const q = wert("q").trim();
  const archiv = wert("archiv") === "1";
  const netto = wert("netto") === "1";
  const status = wert("status").split(",").filter(istRechnungAnzeigeStatus);
  const projektIds = wert("projekt").split(",").filter((x) => UUID.test(x));
  const zeitraum = istTag(wert("von")) && istTag(wert("bis")) ? { von: wert("von"), bis: wert("bis") } : null;
  const heute = heuteIso();

  const { zeilen: alle } = await rechnungenLaden({ q, archiv, limit: 1000 });
  const mitStatus = alle.map((z) => ({ ...z, anzeige: anzeigeStatus(z, heute) }));
  const zeilen = rechnungenFiltern(mitStatus, { von: zeitraum?.von, bis: zeitraum?.bis, status, projektIds });
  const betrag = (z: (typeof zeilen)[number]) => (netto ? z.netto : z.brutto);
  // „Offen“ rechnet immer vom Bruttobetrag aus; bei Netto-Ansicht den Nettoanteil nehmen
  const offen = (z: (typeof zeilen)[number]) => offenerBetrag({ brutto: betrag(z) }, z.anzeige);

  const projektOptionen: ListenOption[] = [...new Map(alle.map((z) => [z.projektId, z])).values()]
    .sort((a, b) => a.projektName.localeCompare(b.projektName, "de"))
    .map((z) => ({ id: z.projektId, text: [z.projektnummer, z.projektName].filter(Boolean).join(" - ") }));
  const statusOptionen: ListenOption[] = FILTER_STATUS.map((s) => ({
    id: s,
    text: RECHNUNG_ANZEIGE_NAMEN[s],
    anzeige: <StatusPille name={RECHNUNG_ANZEIGE_NAMEN[s]} farbe={RECHNUNG_ANZEIGE_FARBEN[s]} />,
  }));
  const bezahlt = summe(zeilen.filter((z) => z.anzeige === "bezahlt").map(betrag));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Ausgangsrechnungen</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Eine Rechnung entsteht aus einem Angebot („Rechnung erstellen“ im Angebot). Nummer und Datei kommen von Lexware Office, Status und Fälligkeit vom letzten Abgleich.
        </p>
      </div>

      <BelegFilter
        q={q}
        platzhalter="Suche nach Nummer, Kunde, Projekt, …"
        zeitraum={zeitraum}
        heute={heute}
        status={status}
        statusOptionen={statusOptionen}
        projektIds={projektIds}
        projekte={projektOptionen}
        netto={netto}
        archiv={archiv}
      />

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs font-semibold">
              <th className="px-3 py-2.5">Re.-Nr.</th>
              <th className="px-3 py-2.5">Rechnung</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Empfänger</th>
              <th className="hidden px-3 py-2.5 sm:table-cell">Datum</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Fällig</th>
              <th className="px-3 py-2.5 text-right">Betrag {netto ? "netto" : "brutto"} €</th>
              <th className="hidden px-3 py-2.5 text-right lg:table-cell">Offen €</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">{alle.length ? "Keine Rechnungen mit diesen Filtern." : "Noch keine Rechnung. Öffne ein Angebot und tippe auf „Rechnung erstellen“."}</td></tr>
            )}
            {zeilen.map((z) => {
              const faellig = faelligText(z, z.anzeige, heute);
              const o = offen(z);
              return (
                <tr key={z.id} className="relative border-b last:border-b-0 hover:bg-muted/40">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Link href={`/buero/rechnungen/${z.id}`} className="font-semibold after:absolute after:inset-0 after:content-['']">{z.rechnungsnummer || "Entwurf"}</Link>
                  </td>
                  <td className="max-w-72 px-3 py-2.5">
                    <span className="block truncate font-medium">{z.betreff}</span>
                    <span className="block truncate text-xs text-muted-foreground">Rechnung · {[z.projektnummer, z.projektName].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="hidden max-w-44 truncate px-3 py-2.5 md:table-cell">{z.kunde || "–"}</td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap sm:table-cell">{formatDatum(z.rechnungsdatum)}</td>
                  <td className="px-3 py-2.5"><StatusPille name={RECHNUNG_ANZEIGE_NAMEN[z.anzeige]} farbe={RECHNUNG_ANZEIGE_FARBEN[z.anzeige]} /></td>
                  <td className={cn("hidden px-3 py-2.5 whitespace-nowrap lg:table-cell", faellig.startsWith("-") && "font-medium text-destructive")}>{faellig || "–"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatBetrag(betrag(z))}</td>
                  <td className={cn("hidden px-3 py-2.5 text-right tabular-nums lg:table-cell", (z.anzeige === "ueberfaellig" || z.anzeige === "angemahnt") && "font-semibold text-destructive")}>{o ? formatBetrag(o) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
          {zeilen.length > 0 && (
            <tfoot>
              <tr className="border-t text-xs">
                <td colSpan={6} className="px-3 py-2.5 text-muted-foreground">
                  {zeilen.length} {zeilen.length === 1 ? "Rechnung" : "Rechnungen"}
                  {bezahlt > 0 && <span> · Bezahlt {formatBetrag(bezahlt)}</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatBetrag(summe(zeilen.map(betrag)))}</td>
                <td className="hidden px-3 py-2.5 text-right font-semibold tabular-nums lg:table-cell">{formatBetrag(summe(zeilen.map(offen)))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
