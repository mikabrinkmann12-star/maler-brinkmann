import type { Metadata } from "next";
import Link from "next/link";
import { BuildingIcon, ChevronRightIcon, PlusIcon, SearchIcon, UploadIcon, UserIcon } from "lucide-react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { kontaktAnzeigename } from "@/lib/kontakt-schema";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Kontakte" };

const MAX = 300;

/** Suchtext für PostgREST-Filter entschärfen (keine Sonderzeichen der Filtersprache). */
function suchtext(roh: string): string {
  return roh.replace(/[^\p{L}\p{N} .\-@/]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export default async function KontakteSeite({ searchParams }: PageProps<"/buero/kontakte">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const q = suchtext(typeof params.q === "string" ? params.q : "");
  const typ = params.typ === "privat" || params.typ === "firma" ? params.typ : "alle";
  const archiv = params.archiv === "1";

  const supabase = await createClient();
  let abfrage = supabase
    .from("contacts")
    .select("id, kundennummer, typ, firmenname, vorname, nachname, strasse, plz, ort, telefon, mobil, email, archiviert_am", { count: "exact" });
  abfrage = archiv ? abfrage.not("archiviert_am", "is", null) : abfrage.is("archiviert_am", null);
  if (typ !== "alle") abfrage = abfrage.eq("typ", typ);
  if (q) {
    const felder = ["firmenname", "vorname", "nachname", "kundennummer", "strasse", "plz", "ort", "telefon", "mobil", "email"];
    abfrage = abfrage.or(felder.map((f) => `${f}.ilike.%${q}%`).join(","));
  }
  const { data, count, error } = await abfrage.limit(MAX);
  if (error) throw new Error("Die Kontakte konnten nicht geladen werden.");

  const kontakte = [...data].sort((a, b) =>
    kontaktAnzeigename({ firmenname: a.firmenname, vorname: a.nachname ? "" : a.vorname, nachname: a.nachname })
      .localeCompare(kontaktAnzeigename({ firmenname: b.firmenname, vorname: b.nachname ? "" : b.vorname, nachname: b.nachname }), "de"),
  );
  const link = (teil: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, typ: typ === "alle" ? undefined : typ, archiv: archiv ? "1" : undefined, ...teil })) if (v) p.set(k, v);
    return `/buero/kontakte${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kontakte</h1>
          <p className="text-sm text-muted-foreground">{count ?? 0} {archiv ? "archivierte" : ""} Kontakte{q && ` für „${q}“`}</p>
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
        <Button type="submit" size="lg">Suchen</Button>
      </form>

      <div className="flex flex-wrap gap-2 text-sm" aria-label="Filter">
        {([["alle", "Alle"], ["privat", "Privat"], ["firma", "Firmen"]] as const).map(([wert, name]) => (
          <Link key={wert} href={link({ typ: wert === "alle" ? undefined : wert })} aria-current={typ === wert ? "true" : undefined}
            className={cn("flex h-9 items-center rounded-full border px-4", typ === wert ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {name}
          </Link>
        ))}
        <Link href={link({ archiv: archiv ? undefined : "1" })} aria-current={archiv ? "true" : undefined}
          className={cn("flex h-9 items-center rounded-full border px-4", archiv ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
          Archiv
        </Link>
      </div>

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
              {k.kundennummer && <span className="hidden shrink-0 text-sm text-muted-foreground sm:block">{k.kundennummer}</span>}
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {(count ?? 0) > MAX && <p className="text-sm text-muted-foreground">Es werden die ersten {MAX} gezeigt. Bitte genauer suchen.</p>}
    </div>
  );
}
