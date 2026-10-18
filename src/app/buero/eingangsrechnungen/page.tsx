import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import { BelegFilter } from "@/components/listen/beleg-filter";
import type { ListenOption } from "@/components/listen/mehrfach-liste";
import { StatusPille } from "@/components/status-pille";
import { summe } from "@/lib/angebot-liste";
import { requireRole } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import {
  EINGANG_ANZEIGE_FARBEN,
  EINGANG_ANZEIGE_NAMEN,
  ZUWEISUNG_FARBEN,
  ZUWEISUNG_NAMEN,
  eingangAnzeige,
  eingangFaelligText,
  eingangFiltern,
  istEingangAnzeige,
  istZuweisung,
  zuweisungStatus,
  zuweisungText,
  type Zuweisung,
} from "@/lib/eingangsrechnung";
import { eingangsrechnungenLaden } from "@/lib/eingangsrechnung-daten";
import { imapKonfiguration } from "@/lib/env";
import { formatBetrag, formatDatum } from "@/lib/format";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { istTag } from "@/lib/zeitraum";
import { EingangReiter, PostfachAbrufen, RechnungHinzufuegen, ZahlstatusPille, ZuweisungFilter } from "./eingang-bausteine";

export const metadata: Metadata = { title: "Eingangsrechnungen" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZAHL_STATUS = ["offen", "ueberfaellig", "bezahlt"] as const;

export default async function EingangsrechnungenListe({ searchParams }: PageProps<"/buero/eingangsrechnungen">) {
  await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const q = wert("q").trim();
  const archiv = wert("archiv") === "1";
  const netto = wert("netto") === "1";
  const nurPruefen = wert("tab") === "pruefen";
  const status = wert("status").split(",").filter(istEingangAnzeige);
  const zuweisung = wert("zuweisung").split(",").filter(istZuweisung) as Zuweisung[];
  const projektIds = wert("projekt").split(",").filter((x) => UUID.test(x));
  const zeitraum = istTag(wert("von")) && istTag(wert("bis")) ? { von: wert("von"), bis: wert("bis") } : null;
  const heute = heuteIso();

  const alle = (await eingangsrechnungenLaden({ archiv })).map((z) => ({ ...z, anzeige: eingangAnzeige(z, heute) }));
  const zuPruefen = alle.filter((z) => z.zuPruefen).length;
  const zeilen = eingangFiltern(alle, { q, von: zeitraum?.von, bis: zeitraum?.bis, anzeige: status, zuweisung, projektIds, nurZuPruefen: nurPruefen });
  const betrag = (z: (typeof zeilen)[number]) => (netto ? z.netto : z.brutto);

  const projektOptionen: ListenOption[] = [...new Map(alle.filter((z) => z.projectId).map((z) => [z.projectId as string, z])).values()]
    .sort((a, b) => a.projektText.localeCompare(b.projektText, "de"))
    .map((z) => ({ id: z.projectId as string, text: z.projektText }));
  const statusOptionen: ListenOption[] = ZAHL_STATUS.map((s) => ({
    id: s,
    text: EINGANG_ANZEIGE_NAMEN[s],
    anzeige: <StatusPille name={EINGANG_ANZEIGE_NAMEN[s]} farbe={EINGANG_ANZEIGE_FARBEN[s]} />,
  }));
  const zuweisungOptionen: ListenOption[] = (["vollstaendig", "keine"] as const).map((s) => ({
    id: s,
    text: ZUWEISUNG_NAMEN[s],
    anzeige: <StatusPille name={ZUWEISUNG_NAMEN[s]} farbe={ZUWEISUNG_FARBEN[s]} />,
  }));
  const offen = summe(zeilen.filter((z) => z.anzeige !== "bezahlt").map((z) => betrag(z) ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Eingangsrechnungen</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Rechnungen von Lieferanten. Beim Hinzufügen werden Nummer, Datum und Beträge automatisch aus der Datei gelesen (E-Rechnung oder PDF) und bleiben „Zu prüfen“, bis du sie bestätigst. Die Buchhaltung bleibt in Lexware.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {imapKonfiguration() && <PostfachAbrufen />}
          <RechnungHinzufuegen />
        </div>
      </div>

      <EingangReiter aktiv={nurPruefen ? "pruefen" : "alle"} zuPruefen={zuPruefen} />

      <BelegFilter
        q={q}
        platzhalter="Suche nach Lieferant, Nummer, Projekt, …"
        zeitraum={zeitraum}
        heute={heute}
        status={status}
        statusOptionen={statusOptionen}
        projektIds={projektIds}
        projekte={projektOptionen}
        netto={netto}
        archiv={archiv}
        zusatz={<ZuweisungFilter gewaehlt={zuweisung} optionen={zuweisungOptionen} />}
      />

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs font-semibold">
              <th className="px-3 py-2.5">Lieferant</th>
              <th className="hidden px-3 py-2.5 sm:table-cell">Re.-Nr.</th>
              <th className="hidden px-3 py-2.5 sm:table-cell">Re.-Datum</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Fällig</th>
              <th className="px-3 py-2.5 text-right">Betrag {netto ? "netto" : "brutto"} €</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Kostenzuweisung</th>
              <th className="px-3 py-2.5">Zahlstatus</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Hochgeladen</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                  {alle.length
                    ? nurPruefen && !zuPruefen
                      ? "Nichts zu prüfen. Alle Rechnungen sind bestätigt."
                      : "Keine Rechnungen mit diesen Filtern."
                    : archiv
                      ? "Das Archiv ist leer."
                      : "Noch keine Eingangsrechnung. Tippe oben auf „Rechnung hinzufügen“ und wähle eine PDF- oder XML-Datei."}
                </td>
              </tr>
            )}
            {zeilen.map((z) => {
              const faellig = eingangFaelligText(z, z.anzeige, heute);
              const zuw = zuweisungStatus(z);
              return (
                <tr key={z.id} className="relative border-b last:border-b-0 hover:bg-muted/40">
                  <td className="max-w-60 px-3 py-2.5">
                    <Link href={`/buero/eingangsrechnungen/${z.id}`} className="flex items-center gap-1.5 font-semibold after:absolute after:inset-0 after:content-['']">
                      {z.zuPruefen && <TriangleAlertIcon aria-label="Zu prüfen" className="size-3.5 shrink-0 text-amber-500" />}
                      <span className="truncate">{z.lieferant || "Lieferant fehlt"}</span>
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground sm:hidden">{z.rechnungsnummer}</span>
                  </td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap sm:table-cell">{z.rechnungsnummer || "–"}</td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap sm:table-cell">{z.rechnungsdatum ? formatDatum(z.rechnungsdatum) : "–"}</td>
                  <td className={cn("hidden px-3 py-2.5 whitespace-nowrap lg:table-cell", faellig.startsWith("-") && "font-medium text-destructive")}>{faellig || "–"}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{betrag(z) === null ? "–" : formatBetrag(betrag(z) as number)}</td>
                  <td className="hidden max-w-56 px-3 py-2.5 md:table-cell">
                    <StatusPille name={ZUWEISUNG_NAMEN[zuw]} farbe={ZUWEISUNG_FARBEN[zuw]} />
                    {zuw === "vollstaendig" && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{zuweisungText(z)}</span>}
                  </td>
                  <td className="px-3 py-2.5"><ZahlstatusPille id={z.id} anzeige={z.anzeige} /></td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap lg:table-cell">
                    {formatDatum(z.hochgeladenAm.slice(0, 10))}
                    {z.hochgeladenVon && <span className="block text-xs text-muted-foreground">{z.hochgeladenVon}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {zeilen.length > 0 && (
            <tfoot>
              <tr className="border-t text-xs">
                <td colSpan={4} className="px-3 py-2.5 text-muted-foreground">
                  {zeilen.length} {zeilen.length === 1 ? "Rechnung" : "Rechnungen"}
                  {offen > 0 && <span> · noch zu bezahlen {formatBetrag(offen)}</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatBetrag(summe(zeilen.map((z) => betrag(z) ?? 0)))}</td>
                <td colSpan={3} className="hidden md:table-cell" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
