import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, MessageCircleIcon, PlusIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import { StatusPille } from "@/components/status-pille";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { ungelesenKarte, zaehlerText } from "@/lib/chat";
import { formatDatum } from "@/lib/format";
import { adresseText } from "@/lib/projekt";
import { istProjektSortierung, projekteSuchen, type ProjektSortierung } from "@/lib/projekt-liste";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { Filterleiste } from "./filterleiste";

export const metadata: Metadata = { title: "Projekte" };

export default async function ProjekteSeite({ searchParams }: PageProps<"/buero/projekte">) {
  await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const q = wert("q");
  const archiv = wert("archiv") === "1";
  const statusId = /^[0-9a-f-]{36}$/i.test(wert("status")) ? wert("status") : "";
  const sortierung: ProjektSortierung = istProjektSortierung(wert("sortierung")) ? (wert("sortierung") as ProjektSortierung) : "neu";

  const supabase = await createClient();
  const [{ projekte, gesamt }, { data: status }, { data: ungelesenDaten }] = await Promise.all([
    projekteSuchen({ q, archiv, statusId, sortierung, limit: 300 }),
    supabase.from("project_statuses").select("id, name").eq("aktiv", true).order("sortierung"),
    supabase.rpc("chat_ungelesen"),
  ]);
  const chatNeu = ungelesenKarte(ungelesenDaten);

  const adresse = (teil: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, archiv: archiv ? "1" : "", status: statusId, sortierung: sortierung === "neu" ? "" : sortierung, ...teil })) if (v) p.set(k, v);
    return `/buero/projekte${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Projekte</h1>
          <p className="text-sm text-muted-foreground">{gesamt} {archiv ? "archivierte " : ""}Projekte{q && ` für „${q}“`}</p>
        </div>
        <Link href="/buero/projekte/neu" className={buttonVariants({ size: "lg" })}><PlusIcon /> Neues Projekt</Link>
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search">
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Projekt, Kunde, Nummer, Straße, Ort …" aria-label="Suchen"
            className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </div>
        {archiv && <input type="hidden" name="archiv" value="1" />}
        {statusId && <input type="hidden" name="status" value={statusId} />}
        {sortierung !== "neu" && <input type="hidden" name="sortierung" value={sortierung} />}
        <Button type="submit" size="lg">Suchen</Button>
      </form>

      <div className="flex gap-2 text-sm" aria-label="Aktiv oder Archiv">
        {([["", "Aktiv"], ["1", "Archiv"]] as const).map(([w, name]) => (
          <Link key={name} href={adresse({ archiv: w })} aria-current={(archiv ? "1" : "") === w ? "true" : undefined}
            className={cn("flex h-9 items-center rounded-full border px-4", (archiv ? "1" : "") === w ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {name}
          </Link>
        ))}
      </div>

      <Filterleiste basis={{ q, archiv: archiv ? "1" : "" }} sortierung={sortierung} statusId={statusId} status={status ?? []} />

      {projekte.length === 0 && <p className="rounded-xl border border-dashed p-6 text-muted-foreground">Keine Projekte gefunden.</p>}
      <ul className="flex flex-col divide-y rounded-xl border">
        {projekte.map((p) => (
          <li key={p.id}>
            <Link href={`/baustellen/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {[p.kunde, adresseText({ strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort })].filter(Boolean).join(" · ") || "Kein Kunde, keine Adresse"}
                </span>
              </span>
              <span className="hidden shrink-0 flex-col items-end gap-1 text-right sm:flex">
                {p.status && <StatusPille name={p.status.name} farbe={p.status.farbe} />}
                <span className="text-xs text-muted-foreground">{p.projektnummer}{p.start_datum && ` · ${formatDatum(p.start_datum)}`}</span>
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
      {gesamt > 300 && <p className="text-sm text-muted-foreground">Es werden die ersten 300 gezeigt. Bitte genauer suchen.</p>}
    </div>
  );
}
