import type { Metadata } from "next";
import Link from "next/link";
import { BuildingIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon, UploadIcon, UserIcon } from "lucide-react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatDatum } from "@/lib/format";
import {
  fehltAngabe,
  istFehlt,
  istSortierung,
  kontakteSortieren,
  orteMitAnzahl,
  type Fehlt,
  type ListenKontakt,
  type Sortierung,
} from "@/lib/kontakt-liste";
import { kontaktAnzeigename } from "@/lib/kontakt-schema";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { suchtext } from "@/lib/suche";
import { createClient } from "@/lib/supabase/server";
import { Filterleiste } from "./filterleiste";

export const metadata: Metadata = { title: "Kontakte" };

const PRO_SEITE = 100;
const SPALTEN = "id, kundennummer, typ, firmenname, vorname, nachname, strasse, plz, ort, telefon, mobil, email, created_at, updated_at";

export default async function KontakteSeite({ searchParams }: PageProps<"/buero/kontakte">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const q = suchtext(wert("q"));
  const typ: "privat" | "firma" | "alle" = wert("typ") === "privat" ? "privat" : wert("typ") === "firma" ? "firma" : "alle";
  const archiv = wert("archiv") === "1";
  const sortierung: Sortierung = istSortierung(wert("sortierung")) ? (wert("sortierung") as Sortierung) : "name_auf";
  const ort = wert("ort");
  const fehlt: Fehlt | "" = istFehlt(wert("fehlt")) ? (wert("fehlt") as Fehlt) : "";
  const seite = Math.max(1, Number.parseInt(wert("seite"), 10) || 1);

  // Alle Treffer laden (PostgREST liefert höchstens 1000 pro Anfrage)
  const supabase = await createClient();
  const baue = () => {
    let a = supabase.from("contacts").select(SPALTEN);
    a = archiv ? a.not("archiviert_am", "is", null) : a.is("archiviert_am", null);
    if (typ !== "alle") a = a.eq("typ", typ);
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

  const orte = orteMitAnzahl(geladen);
  const gefiltert = geladen.filter((k) => (!ort || k.ort?.trim() === ort) && (!fehlt || fehltAngabe(k, fehlt)));
  const sortiert = kontakteSortieren(gefiltert, sortierung);
  const seiten = Math.max(1, Math.ceil(sortiert.length / PRO_SEITE));
  const aktuelleSeite = Math.min(seite, seiten);
  const kontakte = sortiert.slice((aktuelleSeite - 1) * PRO_SEITE, aktuelleSeite * PRO_SEITE);

  const adresse = (teil: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const alle = { q, typ: typ === "alle" ? "" : typ, archiv: archiv ? "1" : "", sortierung: sortierung === "name_auf" ? "" : sortierung, ort, fehlt, ...teil };
    for (const [k, v] of Object.entries(alle)) if (v) p.set(k, v);
    return `/buero/kontakte${p.size ? `?${p}` : ""}`;
  };
  const zeigDatum = sortierung.startsWith("angelegt") ? "created_at" : "updated_at";

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kontakte</h1>
          <p className="text-sm text-muted-foreground">
            {sortiert.length} {archiv ? "archivierte " : ""}Kontakte{q && ` für „${q}“`}{ort && ` in ${ort}`}
          </p>
        </div>
        <div className="flex gap-2">
          {nutzer.rolle === "admin" && (
            <Link href="/buero/kontakte/import" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <UploadIcon /> Import
            </Link>
          )}
          <Link href="/buero/kontakte/neu" className={buttonVariants({ size: "lg" })}>
            <PlusIcon /> Neuer Kontakt
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search">
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={q} placeholder="Name, Ort, Kundennummer, Telefon …" aria-label="Suchen"
            className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </div>
        {typ !== "alle" && <input type="hidden" name="typ" value={typ} />}
        {archiv && <input type="hidden" name="archiv" value="1" />}
        {sortierung !== "name_auf" && <input type="hidden" name="sortierung" value={sortierung} />}
        {ort && <input type="hidden" name="ort" value={ort} />}
        {fehlt && <input type="hidden" name="fehlt" value={fehlt} />}
        <Button type="submit" size="lg">Suchen</Button>
      </form>

      <div className="flex flex-wrap gap-2 text-sm" aria-label="Filter">
        {([["alle", "Alle"], ["privat", "Privat"], ["firma", "Firmen"]] as const).map(([w, name]) => (
          <Link key={w} href={adresse({ typ: w === "alle" ? "" : w, seite: "" })} aria-current={typ === w ? "true" : undefined}
            className={cn("flex h-9 items-center rounded-full border px-4", typ === w ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {name}
          </Link>
        ))}
        <Link href={adresse({ archiv: archiv ? "" : "1", seite: "" })} aria-current={archiv ? "true" : undefined}
          className={cn("flex h-9 items-center rounded-full border px-4", archiv ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
          Archiv
        </Link>
      </div>

      <Filterleiste
        basis={{ q, typ: typ === "alle" ? "" : typ, archiv: archiv ? "1" : "" }}
        sortierung={sortierung}
        ort={ort}
        fehlt={fehlt}
        orte={orte}
      />

      {kontakte.length === 0 && <p className="rounded-xl border border-dashed p-6 text-muted-foreground">Keine Kontakte gefunden.</p>}
      <ul className="flex flex-col divide-y rounded-xl border">
        {kontakte.map((k) => (
          <li key={k.id}>
            <Link href={`/buero/kontakte/${k.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
              {k.typ === "firma" ? <BuildingIcon className="size-5 shrink-0 text-muted-foreground" /> : <UserIcon className="size-5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{kontaktAnzeigename(k)}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {[[k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", "), k.mobil || k.telefon].filter(Boolean).join(" · ") || "Keine Adresse"}
                </span>
              </span>
              <span className="hidden shrink-0 text-right text-sm text-muted-foreground sm:block">
                {k.kundennummer && <span className="block">{k.kundennummer}</span>}
                <span className="block text-xs">{zeigDatum === "created_at" ? "angelegt" : "bearbeitet"} {formatDatum(k[zeigDatum])}</span>
              </span>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      {seiten > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Seiten">
          <Link href={adresse({ seite: aktuelleSeite > 2 ? String(aktuelleSeite - 1) : "" })} aria-disabled={aktuelleSeite === 1}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), aktuelleSeite === 1 && "pointer-events-none opacity-50")}>
            <ChevronLeftIcon /> Zurück
          </Link>
          <span className="text-sm text-muted-foreground">Seite {aktuelleSeite} von {seiten}</span>
          <Link href={adresse({ seite: String(aktuelleSeite + 1) })} aria-disabled={aktuelleSeite === seiten}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), aktuelleSeite === seiten && "pointer-events-none opacity-50")}>
            Weiter <ChevronRightIcon />
          </Link>
        </nav>
      )}
    </div>
  );
}
