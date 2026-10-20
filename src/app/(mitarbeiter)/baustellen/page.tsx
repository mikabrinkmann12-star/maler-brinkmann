import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveIcon, ChevronRightIcon, MessageCircleIcon, SearchIcon } from "lucide-react";
import { StatusPille } from "@/components/status-pille";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth";
import { ungelesenKarte, zaehlerText } from "@/lib/chat";
import { heuteIso } from "@/lib/datum";
import { formatDatum } from "@/lib/format";
import { meineEinsaetze, meineProjektIds } from "@/lib/mitarbeiter-daten";
import { adresseText, kontaktName } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Baustellen" };

export default async function BaustellenSeite({ searchParams }: PageProps<"/baustellen">) {
  const nutzer = await requireUser();
  const { q: qParam } = await searchParams;
  const suche = (typeof qParam === "string" ? qParam : "").trim().toLowerCase().slice(0, 60);
  const [ids, heute] = await Promise.all([meineProjektIds(nutzer.id), meineEinsaetze(nutzer.id, heuteIso())]);
  const heuteIds = new Set(heute.flatMap((e) => e.assignment_stops.map((s) => s.projects?.id)).filter(Boolean));

  const supabase = await createClient();
  const { data: ungelesenDaten } = await supabase.rpc("chat_ungelesen");
  const chatNeu = ungelesenKarte(ungelesenDaten);
  const { data } = ids.length
    ? await supabase
        .from("projects")
        .select("id, name, baustelle_strasse, baustelle_plz, baustelle_ort, start_datum, end_datum, project_statuses(name, farbe, sortierung), contacts(firmenname, vorname, nachname)")
        .in("id", ids)
        .is("archiviert_am", null)
    : { data: [] };

  const projekte = [...(data ?? [])]
    .filter((p) =>
      !suche ||
      [p.name, kontaktName(p.contacts), adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort })]
        .join(" ")
        .toLowerCase()
        .includes(suche),
    )
    .sort((a, b) => {
    const h = Number(heuteIds.has(b.id)) - Number(heuteIds.has(a.id));
    if (h) return h;
    return (a.project_statuses?.sortierung ?? 99) - (b.project_statuses?.sortierung ?? 99);
  });

  return (
    <div className="flex flex-col gap-5">
      <form method="get" role="search" className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={qParam && typeof qParam === "string" ? qParam : ""} placeholder="Suchen" className="h-12 pl-10 text-base" />
      </form>
      {projekte.length === 0 && (
        <p className="rounded-xl border border-dashed p-5 text-muted-foreground">
          {suche ? "Nichts gefunden." : "Du bist noch auf keinem Projekt eingetragen."}
        </p>
      )}
      <Link href="/baustellen/archiv" className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted">
        <ArchiveIcon className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1">
          <span className="block font-medium">Archiv durchsuchen</span>
          <span className="block text-sm text-muted-foreground">Abgeschlossene Baustellen nachschauen (Farbe, Material, Fotos, Kunde)</span>
        </span>
        <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
      </Link>
      <ul className="flex flex-col gap-3">
        {projekte.map((p) => (
          <li key={p.id}>
            <Link href={`/baustellen/${p.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-semibold">{p.name}</span>
                <span className="block truncate text-sm font-semibold text-muted-foreground">
                  {kontaktName(p.contacts) || "Kein Kunde"}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort }) || "Keine Adresse"}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  {p.project_statuses && <StatusPille name={p.project_statuses.name} farbe={p.project_statuses.farbe} />}
                  {heuteIds.has(p.id) && <span className="font-medium text-foreground">heute</span>}
                  {p.start_datum && <span>{formatDatum(p.start_datum)}–{formatDatum(p.end_datum)}</span>}
                </span>
              </span>
              {(chatNeu.get(p.id) ?? 0) > 0 && (
                <span aria-label={`${chatNeu.get(p.id)} neue Chat-Nachrichten`} className="flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 text-sm font-semibold leading-6 text-white">
                  <MessageCircleIcon className="size-4" /> {zaehlerText(chatNeu.get(p.id) ?? 0)}
                </span>
              )}
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
