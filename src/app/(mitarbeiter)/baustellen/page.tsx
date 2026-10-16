import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatDatum } from "@/lib/format";
import { meineEinsaetze, meineProjektIds } from "@/lib/mitarbeiter-daten";
import { adresseText } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Baustellen" };

export default async function BaustellenSeite() {
  const nutzer = await requireUser();
  const [ids, heute] = await Promise.all([meineProjektIds(nutzer.id), meineEinsaetze(nutzer.id, heuteIso())]);
  const heuteIds = new Set(heute.flatMap((e) => e.assignment_stops.map((s) => s.projects?.id)).filter(Boolean));

  const supabase = await createClient();
  const { data } = ids.length
    ? await supabase
        .from("projects")
        .select("id, name, baustelle_strasse, baustelle_plz, baustelle_ort, start_datum, end_datum, project_statuses(name, farbe, sortierung)")
        .in("id", ids)
        .is("archiviert_am", null)
    : { data: [] };

  const projekte = [...(data ?? [])].sort((a, b) => {
    const h = Number(heuteIds.has(b.id)) - Number(heuteIds.has(a.id));
    if (h) return h;
    return (a.project_statuses?.sortierung ?? 99) - (b.project_statuses?.sortierung ?? 99);
  });

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Meine Baustellen</h1>
      {projekte.length === 0 && (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">
          Du bist noch auf keiner Baustelle eingetragen.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {projekte.map((p) => (
          <li key={p.id}>
            <Link href={`/baustellen/${p.id}`} className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: p.project_statuses?.farbe ?? "#94a3b8" }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-medium">{p.name}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort }) || "Keine Adresse"}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {p.project_statuses?.name}
                  {heuteIds.has(p.id) && <span className="font-medium text-foreground"> · heute</span>}
                  {p.start_datum && ` · ${formatDatum(p.start_datum)}–${formatDatum(p.end_datum)}`}
                </span>
              </span>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
