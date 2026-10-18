import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { feiertageImJahr } from "@/lib/feiertage";
import { formatDatum } from "@/lib/format";
import { wochentagName } from "@/lib/listen-anzeige";

export const metadata: Metadata = { title: "Feiertage" };

export default async function FeiertageSeite({ searchParams }: PageProps<"/buero/einstellungen/feiertage">) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const heute = heuteIso();
  const aktuellesJahr = Number(heute.slice(0, 4));
  const gewuenscht = Number(typeof params.jahr === "string" ? params.jahr : "");
  const jahr = Number.isInteger(gewuenscht) && gewuenscht >= 2000 && gewuenscht <= 2100 ? gewuenscht : aktuellesJahr;
  const feiertage = [...feiertageImJahr(jahr).entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Feiertage</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Bundesland <strong className="font-medium text-foreground">Niedersachsen</strong>. An diesen Tagen ist das Soll 0 Stunden, sie werden beim Urlaub nicht
          mitgezählt und bei genehmigtem Urlaub nicht als Zeit gebucht. Die Tage werden berechnet (Ostern, Pfingsten usw.), du musst nichts eintragen.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Link href={`/buero/einstellungen/feiertage?jahr=${jahr - 1}`} aria-label="Vorheriges Jahr" className="flex size-8 items-center justify-center rounded-md border bg-white hover:bg-muted">
          <ChevronLeftIcon className="size-4" />
        </Link>
        <span className="w-16 text-center text-[15px] font-semibold tabular-nums">{jahr}</span>
        <Link href={`/buero/einstellungen/feiertage?jahr=${jahr + 1}`} aria-label="Nächstes Jahr" className="flex size-8 items-center justify-center rounded-md border bg-white hover:bg-muted">
          <ChevronRightIcon className="size-4" />
        </Link>
        {jahr !== aktuellesJahr && (
          <Link href="/buero/einstellungen/feiertage" className="ml-2 text-[13px] text-muted-foreground hover:underline">Dieses Jahr</Link>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs font-semibold">
              <th className="px-3 py-2.5">Datum</th>
              <th className="px-3 py-2.5">Wochentag</th>
              <th className="px-3 py-2.5">Feiertag</th>
            </tr>
          </thead>
          <tbody>
            {feiertage.map(([datum, name]) => (
              <tr key={datum} className="border-b last:border-b-0">
                <td className="px-3 py-2.5 font-medium whitespace-nowrap">{formatDatum(datum)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{wochentagName(datum)}</td>
                <td className="px-3 py-2.5">{name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
