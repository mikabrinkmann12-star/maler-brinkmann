import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ArtenFenster } from "@/components/zeiten/arten-fenster";
import { ZeitenFilter } from "@/components/zeiten/zeiten-filter";
import { ZeitenTabs } from "@/components/zeiten/zeiten-tabs";
import { requireRole } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatDatum } from "@/lib/format";
import { bearbeitetText, stundenHM, wochentagName } from "@/lib/listen-anzeige";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { ZEIT_ARTEN, ZEIT_ART_NAMEN, istZeitArt } from "@/lib/zeiten";
import {
  ZEIT_ART_EMOJI,
  eintraegeSortieren,
  kennzahlen,
  nachTagGruppieren,
  pauseText,
  zeitenFiltern,
} from "@/lib/zeiten-auswertung";
import { bueroPersonen, personenNamen, zeitraumEintraege } from "@/lib/zeiten-buero-daten";
import { istTag, vorgabeBereich } from "@/lib/zeitraum";

export const metadata: Metadata = { title: "Zeiten" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BueroZeitenSeite({ searchParams }: PageProps<"/buero/zeiten">) {
  await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const heute = heuteIso();
  const standard = vorgabeBereich("dieser_monat", heute);
  const zeitraum = istTag(wert("von")) && istTag(wert("bis")) && wert("von") <= wert("bis") ? { von: wert("von"), bis: wert("bis") } : standard;
  const personIds = wert("person").split(",").filter((x) => UUID.test(x));
  const projektIds = wert("projekt").split(",").filter((x) => UUID.test(x));
  const arten = wert("art").split(",").filter(istZeitArt);
  const q = wert("q").trim();

  const supabase = await createClient();
  const [personen, alle, { data: projekte }, { count: offeneAntraege }] = await Promise.all([
    bueroPersonen(),
    zeitraumEintraege(zeitraum.von, zeitraum.bis),
    supabase.from("projects").select("id, name, projektnummer").order("updated_at", { ascending: false }).limit(500),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "offen"),
  ]);
  const namen = personenNamen(personen);
  const eintraege = eintraegeSortieren(zeitenFiltern(alle, { personIds, projektIds, arten, q }, namen), namen)
    .reverse() // neueste Tage zuerst, innerhalb eines Tages bleibt die Reihenfolge nach Name
    .sort((a, b) => b.datum.localeCompare(a.datum) || (namen.get(a.userId) ?? "").localeCompare(namen.get(b.userId) ?? "", "de"));
  const gruppen = nachTagGruppieren(eintraege);
  const k = kennzahlen(eintraege);

  const adresse = (pfad: string, teil: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    for (const [n, v] of Object.entries({ von: zeitraum.von, bis: zeitraum.bis, person: personIds.join(","), projekt: projektIds.join(","), art: arten.join(","), q, ...teil })) {
      if (v) p.set(n, v);
    }
    return `${pfad}?${p}`;
  };
  const tage = (n: number | undefined) => `${n ?? 0} ${n === 1 ? "Tag" : "Tage"}`;
  const kennzahl = (titel: string, text: string) => (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{titel}</span>
      <span className="text-[13px] font-semibold">{text}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Zeiten</h1>
        <Link href={`/buero/zeiten/neu${personIds.length === 1 ? `?person=${personIds[0]}` : ""}`} className={buttonVariants({ className: "h-8 px-3 text-[13px]" })}>
          <PlusIcon className="size-3.5 sm:hidden" /> Neue Zeit
        </Link>
      </div>

      <ZeitenTabs aktiv="alle" offeneAntraege={offeneAntraege ?? 0} />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border bg-white px-4 py-3">
        {kennzahl("Arbeitszeit", `${stundenHM(k.jeArt.arbeitszeit?.stunden)}${k.jeArt.arbeitszeit ? " Std." : ""}`)}
        {kennzahl("Fahrtzeit", k.jeArt.fahrtzeit ? `${stundenHM(k.jeArt.fahrtzeit.stunden)} Std.` : "-")}
        {kennzahl("Überstundenabbau", k.jeArt.ueberstundenabbau ? `${stundenHM(k.jeArt.ueberstundenabbau.stunden)} Std.` : "-")}
        {kennzahl("Urlaub", k.jeArt.urlaub ? tage(k.jeArt.urlaub.tage) : "-")}
        {kennzahl("Krank", k.jeArt.krank ? tage(k.jeArt.krank.tage) : "-")}
        <div className="ml-auto"><ArtenFenster summen={k.jeArt} /></div>
      </div>

      <ZeitenFilter
        q={q}
        zeitraum={zeitraum}
        personIds={personIds}
        projektIds={projektIds}
        arten={arten}
        heute={heute}
        personen={personen.filter((p) => p.aktiv).map((p) => ({ id: p.id, text: p.name }))}
        projekte={(projekte ?? []).map((p) => ({ id: p.id, text: [p.projektnummer, p.name].filter(Boolean).join(" - ") }))}
        artOptionen={ZEIT_ARTEN.map((a) => ({ id: a, text: ZEIT_ART_NAMEN[a], anzeige: <span>{ZEIT_ART_EMOJI[a]} {ZEIT_ART_NAMEN[a]}</span> }))}
        exportAdresse={{
          summen: monatsExport(adresse, "summen", zeitraum.von),
          einzeln: monatsExport(adresse, "einzeln", zeitraum.von),
        }}
      />

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs font-semibold">
              <th className="px-3 py-2.5">Datum</th>
              <th className="px-3 py-2.5">Mitarbeiter</th>
              <th className="px-3 py-2.5">Art</th>
              <th className="px-3 py-2.5 text-right">Stunden</th>
              <th className="hidden px-3 py-2.5 text-right sm:table-cell">Pause</th>
              <th className="hidden px-3 py-2.5 md:table-cell">Projekt</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Beschreibung</th>
              <th className="hidden px-3 py-2.5 xl:table-cell">Zuletzt bearbeitet</th>
            </tr>
          </thead>
          <tbody>
            {gruppen.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">Keine Zeiten gefunden.</td></tr>
            )}
            {gruppen.map((g) => (
              <GruppenZeilen key={g.schluessel} gruppe={g} namen={namen} />
            ))}
          </tbody>
          {gruppen.length > 0 && (
            <tfoot>
              <tr className="border-t text-xs">
                <td colSpan={3} className="px-3 py-2.5 text-muted-foreground">{eintraege.length} {eintraege.length === 1 ? "Zeit" : "Zeiten"}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{stundenHM(k.gesamtStunden)}</td>
                <td className="hidden px-3 py-2.5 text-right font-semibold tabular-nums sm:table-cell">{pauseText(Math.round(k.gesamtPause * 60))}</td>
                <td colSpan={3} className="hidden md:table-cell" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** CSV-Adressen: der Export arbeitet je Monat (Monat des Zeitraum-Beginns), die übrigen Filter gelten mit. */
function monatsExport(adresse: (pfad: string, teil?: Record<string, string>) => string, typ: string, von: string): string {
  return adresse("/buero/zeiten/export", { typ, monat: von.slice(0, 7), von: "", bis: "" });
}

function GruppenZeilen({ gruppe, namen }: { gruppe: ReturnType<typeof nachTagGruppieren>[number]; namen: Map<string, string> }) {
  return (
    <>
      {gruppe.eintraege.map((t) => (
        <tr key={t.id} className="relative border-b last:border-b-0 hover:bg-muted/40">
          <td className="px-3 py-2">
            <Link href={`/buero/zeiten/${t.id}`} className="block font-semibold after:absolute after:inset-0 after:content-['']">{formatDatum(t.datum)}</Link>
            <span className="block text-xs text-muted-foreground">{wochentagName(t.datum)}</span>
          </td>
          <td className="px-3 py-2 whitespace-nowrap">{namen.get(t.userId) ?? "Unbekannt"}</td>
          <td className="px-3 py-2 whitespace-nowrap"><span className="mr-1" aria-hidden>{ZEIT_ART_EMOJI[t.art]}</span>{ZEIT_ART_NAMEN[t.art]}</td>
          <td className="px-3 py-2 text-right tabular-nums">{stundenHM(t.stunden)}</td>
          <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{t.von ? pauseText(t.pauseMin) : "-"}</td>
          <td className="hidden max-w-52 px-3 py-2 md:table-cell">
            {t.projektId ? <Link href={`/buero/projekte/${t.projektId}`} className="relative z-10 line-clamp-2 font-medium underline underline-offset-2">{t.projektName}</Link> : "-"}
          </td>
          <td className="hidden max-w-48 truncate px-3 py-2 lg:table-cell">{t.beschreibung}</td>
          <td className="hidden px-3 py-2 whitespace-nowrap xl:table-cell">
            <span className="block">{bearbeitetText(t.bearbeitetAm)}</span>
            {t.bearbeitetVon && <span className="block text-xs text-muted-foreground">{namen.get(t.bearbeitetVon) ?? ""}</span>}
          </td>
        </tr>
      ))}
      {gruppe.summe && (
        <tr className="border-b bg-muted/30 text-xs font-semibold">
          <td colSpan={3} />
          <td className="px-3 py-1.5 text-right tabular-nums">{stundenHM(gruppe.summe.stunden)}</td>
          <td className="hidden px-3 py-1.5 text-right tabular-nums sm:table-cell">{pauseText(gruppe.summe.pauseMin)}</td>
          <td colSpan={3} className="hidden md:table-cell" />
        </tr>
      )}
    </>
  );
}
