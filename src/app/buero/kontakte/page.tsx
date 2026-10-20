import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, BuildingIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, UploadIcon, UserIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { ladeRechte, requireBueroRecht } from "@/lib/auth";
import { rechtOk } from "@/lib/rechte";
import { kontaktFarbwert, istKontaktFarbe } from "@/lib/kontakt-farben";
import {
  fehltAngabe,
  istFehlt,
  kontakteSortieren,
  orteMitAnzahl,
  type Fehlt,
  type ListenKontakt,
  type Sortierung,
} from "@/lib/kontakt-liste";
import { bearbeitetText } from "@/lib/listen-anzeige";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";
import { KontakteFilter } from "./kontakte-filter";
import { ZeilenPapierkorb } from "./zeilen-papierkorb";

export const metadata: Metadata = { title: "Kontakte" };

const PRO_SEITE = 100;
const SPALTEN = "id, kundennummer, typ, firmenname, vorname, nachname, strasse, plz, ort, telefon, mobil, email, farbe, bearbeitet_von, created_at, updated_at";

type SortSpalte = "name" | "nummer" | "bearbeitet";
const SORT_SPALTEN: { id: SortSpalte; text: string; klasse?: string }[] = [
  { id: "name", text: "Name" },
  { id: "nummer", text: "Nummer", klasse: "hidden sm:table-cell" },
  { id: "bearbeitet", text: "Bearbeitet", klasse: "hidden md:table-cell" },
];

function sortierungFuer(spalte: SortSpalte, absteigend: boolean): Sortierung {
  if (spalte === "name") return absteigend ? "name_ab" : "name_auf";
  if (spalte === "nummer") return absteigend ? "nummer_ab" : "nummer_auf";
  return absteigend ? "geaendert_neu" : "geaendert_alt";
}

export default async function KontakteSeite({ searchParams }: PageProps<"/buero/kontakte">) {
  await requireBueroRecht("kontakte_ansehen");
  const rechte = await ladeRechte();
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const q = suchtext(wert("q"));
  const typen = wert("typ").split(",").filter((t): t is "privat" | "firma" => t === "privat" || t === "firma");
  const farben = wert("farbe").split(",").filter(istKontaktFarbe);
  const gewaehlteOrte = wert("ort").split("|").map((o) => o.trim()).filter(Boolean);
  const archiv = wert("archiv") === "1";
  const sort: SortSpalte = wert("sort") === "nummer" || wert("sort") === "bearbeitet" ? (wert("sort") as SortSpalte) : "name";
  const absteigend = wert("dir") ? wert("dir") === "ab" : sort === "bearbeitet";
  const fehlt: Fehlt | "" = istFehlt(wert("fehlt")) ? (wert("fehlt") as Fehlt) : "";
  const seite = Math.max(1, Number.parseInt(wert("seite"), 10) || 1);

  // Alle Treffer laden (PostgREST liefert höchstens 1000 pro Anfrage)
  const supabase = await createClient();
  const baue = () => {
    let a = supabase.from("contacts").select(SPALTEN);
    a = archiv ? a.not("archiviert_am", "is", null) : a.is("archiviert_am", null);
    if (typen.length === 1) a = a.eq("typ", typen[0]);
    if (farben.length) a = a.in("farbe", farben);
    if (q) {
      const felder = ["firmenname", "vorname", "nachname", "kundennummer", "strasse", "plz", "ort", "telefon", "mobil", "email"];
      a = a.or(felder.map((f) => `${f}.ilike.%${q}%`).join(","));
    }
    return a.order("id");
  };
  const geladen: ListenKontakt[] = [];
  for (let von = 0; von < 10_000; von += 1000) {
    const { data, error } = await baue().range(von, von + 999);
    if (error) throw new Error("Die Kontakte konnten nicht geladen werden.");
    geladen.push(...data);
    if (data.length < 1000) break;
  }
  const kollegen = await kollegenLaden();
  const bearbeiter = (id: string | null | undefined) => {
    const k = id ? kollegen.get(id) : null;
    return k ? `${k.vorname} ${k.nachname}`.trim() : "";
  };

  const orte = orteMitAnzahl(geladen);
  const gefiltert = geladen.filter(
    (k) => (!gewaehlteOrte.length || gewaehlteOrte.includes(k.ort?.trim() ?? "")) && (!fehlt || fehltAngabe(k, fehlt)),
  );
  const sortiert = kontakteSortieren(gefiltert, sortierungFuer(sort, absteigend));
  const seiten = Math.max(1, Math.ceil(sortiert.length / PRO_SEITE));
  const aktuelleSeite = Math.min(seite, seiten);
  const kontakte = sortiert.slice((aktuelleSeite - 1) * PRO_SEITE, aktuelleSeite * PRO_SEITE);

  /** Adresse mit denselben Filtern, aber anderer Sortierung oder Seite. */
  const adresse = (teil: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && v) p.set(k, v);
    for (const [k, v] of Object.entries(teil)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/buero/kontakte${p.size ? `?${p}` : ""}`;
  };
  const sortAdresse = (spalte: SortSpalte) =>
    adresse({ sort: spalte, dir: sort === spalte ? (absteigend ? "auf" : "ab") : "auf", seite: "" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Kontakte</h1>
        <div className="flex items-center gap-2">
          {rechtOk(rechte, "kontakte_importieren") && (
            <Link href="/buero/kontakte/import" className={buttonVariants({ variant: "outline", className: "h-8 px-3 text-[13px]" })}>
              <UploadIcon className="size-3.5" /> Import
            </Link>
          )}
          <Link href="/buero/kontakte/neu" className={buttonVariants({ className: "h-8 px-3 text-[13px]" })}>
            <PlusIcon className="size-3.5 sm:hidden" /> Neuer Kontakt
          </Link>
        </div>
      </div>

      <KontakteFilter archiv={archiv} q={q} farben={farben} typen={typen} orte={orte} gewaehlteOrte={gewaehlteOrte} fehlt={fehlt} />

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs font-semibold">
              <th className="w-12 px-3 py-2.5">Typ</th>
              {SORT_SPALTEN.map((s) => (
                <th key={s.id} className={cn("px-3 py-2.5 font-semibold", s.klasse)}>
                  <Link href={sortAdresse(s.id)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {s.text}
                    {sort === s.id && (absteigend ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
                  </Link>
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {kontakte.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Keine Kontakte gefunden.</td></tr>}
            {kontakte.map((k) => {
              const Icon = k.typ === "firma" ? BuildingIcon : UserIcon;
              const wer = bearbeiter(k.bearbeitet_von);
              return (
                <tr key={k.id} className="relative border-b last:border-b-0 hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <Icon className="size-4" style={{ color: kontaktFarbwert(k.farbe) }} aria-label={k.typ === "firma" ? "Firma" : "Person"} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/buero/kontakte/${k.id}`} className="block truncate after:absolute after:inset-0 after:content-['']">
                      {k.firmenname?.trim() ? (
                        <span className="font-semibold">{k.firmenname}</span>
                      ) : (
                        <>
                          {k.vorname} <span className="font-semibold">{k.nachname || (!k.vorname && "Ohne Namen")}</span>
                        </>
                      )}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted-foreground sm:table-cell">{k.kundennummer || "–"}</td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap md:table-cell">
                    <span className="block">{bearbeitetText(k.updated_at)}</span>
                    {wer && <span className="block text-xs text-muted-foreground">{wer}</span>}
                  </td>
                  <td className="relative z-10 px-2 py-2.5"><ZeilenPapierkorb id={k.id} archiviert={archiv} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>{sortiert.length} {sortiert.length === 1 ? "Kontakt" : "Kontakte"}</span>
          {seiten > 1 && (
            <nav className="flex items-center gap-2" aria-label="Seiten">
              <Link href={adresse({ seite: aktuelleSeite > 2 ? String(aktuelleSeite - 1) : "" })} aria-disabled={aktuelleSeite === 1} aria-label="Vorherige Seite" className={cn("rounded p-1 hover:bg-muted", aktuelleSeite === 1 && "pointer-events-none opacity-40")}>
                <ChevronLeftIcon className="size-4" />
              </Link>
              <span>Seite {aktuelleSeite} von {seiten}</span>
              <Link href={adresse({ seite: String(aktuelleSeite + 1) })} aria-disabled={aktuelleSeite === seiten} aria-label="Nächste Seite" className={cn("rounded p-1 hover:bg-muted", aktuelleSeite === seiten && "pointer-events-none opacity-40")}>
                <ChevronRightIcon className="size-4" />
              </Link>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
