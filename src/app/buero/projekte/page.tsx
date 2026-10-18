import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, FileTextIcon, MessageCircleIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { ungelesenKarte, zaehlerText } from "@/lib/chat";
import { heuteIso } from "@/lib/datum";
import { bearbeitetText, personKreis, zeitraumText } from "@/lib/listen-anzeige";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { istProjektSpalte, projekteListe, type ProjektSpalte } from "@/lib/projekt-tabelle-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { istTag } from "@/lib/zeitraum";
import { ProjekteFilter } from "./projekte-filter";
import { StatusWahl } from "./status-wahl";
import { ZeilenMenue } from "./zeilen-menue";

export const metadata: Metadata = { title: "Projekte" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPALTEN: { id: ProjektSpalte | null; text: string; klasse?: string }[] = [
  { id: "name", text: "Name" },
  { id: "nummer", text: "Nummer", klasse: "hidden md:table-cell" },
  { id: "status", text: "Status" },
  { id: "zeitraum", text: "Zeitraum", klasse: "hidden xl:table-cell" },
  { id: "kunde", text: "Kunde", klasse: "hidden lg:table-cell" },
  { id: null, text: "Mitarbeitende", klasse: "hidden lg:table-cell" },
  { id: "bearbeitet", text: "Bearbeitet", klasse: "hidden lg:table-cell" },
];

export default async function ProjekteSeite({ searchParams }: PageProps<"/buero/projekte">) {
  await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const liste = (n: string) => wert(n).split(",").filter((x) => UUID.test(x));
  const q = wert("q").trim();
  const archiv = wert("archiv") === "1";
  const statusIds = liste("status");
  const mitarbeiterIds = liste("mitarbeiter");
  const zeitraum = istTag(wert("von")) && istTag(wert("bis")) ? { von: wert("von"), bis: wert("bis") } : null;
  const sort: ProjektSpalte = istProjektSpalte(wert("sort")) ? (wert("sort") as ProjektSpalte) : "bearbeitet";
  const absteigend = wert("dir") ? wert("dir") === "ab" : sort === "bearbeitet";
  const heute = heuteIso();

  const supabase = await createClient();
  const [{ zeilen, gesamt }, { data: status }, kollegen, { data: ungelesenDaten }] = await Promise.all([
    projekteListe({ q, archiv, statusIds, mitarbeiterIds, von: zeitraum?.von, bis: zeitraum?.bis, sort, absteigend }),
    supabase.from("project_statuses").select("id, name, farbe").eq("aktiv", true).order("sortierung"),
    kollegenLaden(),
    supabase.rpc("chat_ungelesen"),
  ]);
  const chatNeu = ungelesenKarte(ungelesenDaten);
  const personen = [...kollegen.values()].map((k) => ({ id: k.id, name: `${k.vorname} ${k.nachname}`.trim() })).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const statusListe = status ?? [];

  /** Adresse der Spaltenüberschrift: gleiche Filter, andere Sortierung (nochmal antippen = Richtung wechseln). */
  const sortAdresse = (spalte: ProjektSpalte) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v && k !== "sort" && k !== "dir") p.set(k, v);
    p.set("sort", spalte);
    p.set("dir", sort === spalte ? (absteigend ? "auf" : "ab") : "auf");
    return `/buero/projekte?${p}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Projekte</h1>
        <Link href="/buero/projekte/neu" className={buttonVariants({ className: "h-8 px-3 text-[13px]" })}>
          <PlusIcon className="size-3.5 sm:hidden" />
          <span>Neues Projekt</span>
        </Link>
      </div>

      <ProjekteFilter
        archiv={archiv}
        q={q}
        zeitraum={zeitraum}
        statusIds={statusIds}
        mitarbeiterIds={mitarbeiterIds}
        status={statusListe}
        personen={personen}
        heute={heute}
      />

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs font-semibold">
              {SPALTEN.map((s) => (
                <th key={s.text} className={cn("px-3 py-2.5 font-semibold", s.klasse)}>
                  {s.id ? (
                    <Link href={sortAdresse(s.id)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {s.text}
                      {sort === s.id && (absteigend ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
                    </Link>
                  ) : (
                    s.text
                  )}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {zeilen.length === 0 && (
              <tr><td colSpan={SPALTEN.length + 1} className="px-3 py-10 text-center text-muted-foreground">Keine Projekte gefunden.</td></tr>
            )}
            {zeilen.map((p) => (
              <tr key={p.id} className="relative border-b last:border-b-0 hover:bg-muted/40">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      <Link href={`/baustellen/${p.id}`} className="block truncate font-semibold after:absolute after:inset-0 after:content-['']">
                        {p.name}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{p.adresse || "–"}</span>
                    </div>
                    {p.hatDokumente && <FileTextIcon className="ml-auto size-5 shrink-0 rounded bg-muted p-1 text-muted-foreground" aria-label="Hat Dateien" />}
                    {(chatNeu.get(p.id) ?? 0) > 0 && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground" title="Neue Chat-Nachrichten">
                        <MessageCircleIcon className="size-3" /> {zaehlerText(chatNeu.get(p.id) ?? 0)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted-foreground md:table-cell">{p.projektnummer || "–"}</td>
                <td className="relative z-10 px-3 py-2.5">
                  <StatusWahl projektId={p.id} aktuell={p.status} alle={statusListe} />
                </td>
                <td className="hidden px-3 py-2.5 text-muted-foreground xl:table-cell">{zeitraumText(p.start, p.ende)}</td>
                <td className="hidden max-w-44 truncate px-3 py-2.5 lg:table-cell">{p.kunde || "–"}</td>
                <td className="hidden px-3 py-2.5 lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {p.mitglieder.slice(0, 5).map((m) => {
                      const k = personKreis(m.name);
                      return (
                        <span key={m.id} title={m.name} className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-neutral-800" style={{ backgroundColor: k.farbe }}>
                          {k.initialen}
                        </span>
                      );
                    })}
                    {p.mitglieder.length > 5 && <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">+{p.mitglieder.length - 5}</span>}
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 whitespace-nowrap lg:table-cell">
                  <span className="block">{bearbeitetText(p.bearbeitet)}</span>
                  {p.bearbeitetVon && <span className="block text-xs text-muted-foreground">{p.bearbeitetVon}</span>}
                </td>
                <td className="relative z-10 px-2 py-2.5">
                  <ZeilenMenue projektId={p.id} archiviert={archiv} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">{gesamt} {gesamt === 1 ? "Projekt" : "Projekte"}</div>
      </div>
    </div>
  );
}
