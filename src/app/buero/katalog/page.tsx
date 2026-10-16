import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, PlusIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatBetrag, formatZahl } from "@/lib/format";
import {
  KATALOG_ART_NAMEN,
  istKatalogArt,
  ordnerPfad,
  ordnerPfadText,
  unterordner,
  type KatalogArt,
} from "@/lib/katalog";
import { MAX_ZEILEN, eintraegeLaden, ordnerLaden } from "@/lib/katalog-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { NeuerOrdner, OrdnerZeile } from "./ordner-aktionen";

export const metadata: Metadata = { title: "Katalog" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KatalogSeite({ searchParams }: PageProps<"/buero/katalog">) {
  await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const art: KatalogArt = istKatalogArt(wert("art")) ? (wert("art") as KatalogArt) : "material";
  const q = wert("q").trim();
  const archiv = wert("archiv") === "1";

  const alleOrdner = await ordnerLaden(art);
  const aktive = alleOrdner.filter((o) => !o.archiviert);
  // Ungültige oder archivierte Ordner-ID: zurück auf die oberste Ebene
  const ordnerId = UUID.test(wert("ordner")) && aktive.some((o) => o.id === wert("ordner")) ? wert("ordner") : null;
  const sucheAktiv = q.length > 0 || archiv;

  const { zeilen, gesamt } = await eintraegeLaden(art, { ordnerId, q, archiv });
  const pfad = ordnerPfad(aktive, ordnerId);
  const kinder = unterordner(aktive, ordnerId);
  const archivierteOrdner = archiv ? alleOrdner.filter((o) => o.archiviert) : [];
  const istMaterial = art === "material";

  const adresse = (teil: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ art, ...teil })) if (v) p.set(k, v);
    return `/buero/katalog?${p}`;
  };
  const neuHref = `/buero/katalog/neu?art=${art}${ordnerId && !sucheAktiv ? `&ordner=${ordnerId}` : ""}`;

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Katalog</h1>
          <p className="text-sm text-muted-foreground">
            Einkaufspreis oder Kosten plus Zuschlag ergeben den Verkaufspreis. Nur Büro und Admin sehen die Preise.
          </p>
        </div>
        <Link href={neuHref} className={buttonVariants({ size: "lg" })}>
          <PlusIcon /> {istMaterial ? "Neues Material" : "Neue Leistung"}
        </Link>
      </div>

      <div className="flex gap-2 text-sm" role="tablist" aria-label="Art">
        {(["material", "leistung"] as const).map((a) => (
          <Link key={a} href={`/buero/katalog?art=${a}`} role="tab" aria-selected={a === art}
            className={cn("flex h-9 items-center rounded-full border px-4", a === art ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {KATALOG_ART_NAMEN[a]}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search">
        <input type="hidden" name="art" value={art} />
        {archiv && <input type="hidden" name="archiv" value="1" />}
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={q} aria-label="Suchen"
            placeholder={istMaterial ? "Bezeichnung, Artikelnummer, Lieferant …" : "Kurztext, Nummer, Langtext …"}
            className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </div>
        <Button type="submit" size="lg">Suchen</Button>
        <Link href={adresse({ archiv: archiv ? "" : "1", q })} className={buttonVariants({ variant: "ghost", size: "lg" })}>
          {archiv ? "Archiv schließen" : "Archiv"}
        </Link>
      </form>

      {/* Pfad und Ordner (nur beim Blättern, nicht in Suche und Archiv) */}
      {!sucheAktiv && (
        <>
          <nav aria-label="Ordner-Pfad" className="flex flex-wrap items-center gap-1 text-sm">
            <Link href={adresse({})} className={cn("hover:underline", !ordnerId && "font-semibold")}>Alle Ordner</Link>
            {pfad.map((o, i) => (
              <span key={o.id} className="flex items-center gap-1">
                <ChevronRightIcon className="size-4 text-muted-foreground" />
                <Link href={adresse({ ordner: o.id })} className={cn("hover:underline", i === pfad.length - 1 && "font-semibold")}>{o.name}</Link>
              </span>
            ))}
          </nav>

          <section aria-labelledby="ordner-titel" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="ordner-titel" className="text-lg font-semibold">{ordnerId ? "Unterordner" : "Ordner"}</h2>
              <NeuerOrdner art={art} parentId={ordnerId} />
            </div>
            {kinder.length > 0 && (
              <div className="divide-y rounded-xl border">
                {kinder.map((o) => (
                  <OrdnerZeile key={o.id} art={art} ordner={o} alle={aktive} archiviert={false} href={adresse({ ordner: o.id })} />
                ))}
              </div>
            )}
            {kinder.length === 0 && <p className="text-sm text-muted-foreground">{ordnerId ? "Keine Unterordner." : "Noch keine Ordner."}</p>}
          </section>
        </>
      )}

      {archiv && archivierteOrdner.length > 0 && (
        <section aria-labelledby="arch-ordner-titel" className="flex flex-col gap-2">
          <h2 id="arch-ordner-titel" className="text-lg font-semibold">Archivierte Ordner</h2>
          <div className="divide-y rounded-xl border">
            {archivierteOrdner.map((o) => (
              <OrdnerZeile key={o.id} art={art} ordner={o} alle={alleOrdner} archiviert pfadText={ordnerPfadText(alleOrdner, o.id)} href="#" />
            ))}
          </div>
        </section>
      )}

      {/* Einträge */}
      <section aria-labelledby="eintraege-titel" className="flex flex-col gap-2">
        <h2 id="eintraege-titel" className="text-lg font-semibold">
          {archiv ? `Archivierte ${KATALOG_ART_NAMEN[art]}` : q ? `Suche nach „${q}“` : KATALOG_ART_NAMEN[art]}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{gesamt} {gesamt === 1 ? "Eintrag" : "Einträge"}</span>
        </h2>
        {zeilen.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
            {sucheAktiv ? "Nichts gefunden." : ordnerId ? "In diesem Ordner liegt noch nichts." : "Auf der obersten Ebene liegt noch nichts. Lege einen Ordner an oder ein neues Element."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">{istMaterial ? "Bezeichnung" : "Kurztext"}</th>
                  <th scope="col" className="px-3 py-2 font-medium">{istMaterial ? "Artikelnr." : "Nr."}</th>
                  <th scope="col" className="px-3 py-2 font-medium">Einheit</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{istMaterial ? "EK" : "Kosten"}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Zuschlag</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">VK</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {zeilen.map((z) => (
                  <tr key={z.id} className="hover:bg-muted/40">
                    <td className="max-w-80 px-4 py-2">
                      <Link href={`/buero/katalog/${art}/${z.id}`} className="block truncate font-medium hover:underline">{z.name}</Link>
                      {(sucheAktiv || istMaterial) && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {[sucheAktiv ? ordnerPfadText(alleOrdner, z.folderId) || "Ohne Ordner" : "", z.lieferant].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{z.nummer || "–"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{z.einheit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBetrag(z.preis)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatZahl(z.zuschlag)} %</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatBetrag(z.vk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {gesamt > MAX_ZEILEN && <p className="text-sm text-muted-foreground">Es werden die ersten {MAX_ZEILEN} gezeigt. Bitte genauer suchen.</p>}
      </section>
    </div>
  );
}
