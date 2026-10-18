import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveIcon, DownloadIcon, PlusIcon, UploadIcon } from "lucide-react";
import { cn } from "cn";
import { SuchFeld } from "@/components/listen/such-feld";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { KATALOG_ART_NAMEN, istKatalogArt, ordnerBaum, ordnerMitNachfahren, ordnerOptionen, ordnerPfadText, type KatalogArt } from "@/lib/katalog";
import { kalkulationLaden } from "@/lib/kalkulation-daten";
import { MAX_ZEILEN, eintraegeLaden, ordnerLaden, ordnerZaehler } from "@/lib/katalog-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { KalkulationFenster } from "./kalkulation-fenster";
import { KatalogTabelle } from "./katalog-tabelle";
import { OrdnerBaum } from "./ordner-baum";
import { OrdnerZeile } from "./ordner-aktionen";

export const metadata: Metadata = { title: "Stammdaten" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KatalogSeite({ searchParams }: PageProps<"/buero/katalog">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const wert = (n: string) => (typeof params[n] === "string" ? (params[n] as string) : "");
  const art: KatalogArt = istKatalogArt(wert("art")) ? (wert("art") as KatalogArt) : "leistung";
  const q = wert("q").trim();
  const archiv = wert("archiv") === "1";

  const [alleOrdner, zaehler, kalkulation] = await Promise.all([ordnerLaden(art), ordnerZaehler(art), kalkulationLaden()]);
  const aktive = alleOrdner.filter((o) => !o.archiviert);
  // Ungültige oder archivierte Ordner-ID: zeige alles
  const ordnerId = UUID.test(wert("ordner")) && aktive.some((o) => o.id === wert("ordner")) ? wert("ordner") : null;

  const { zeilen, gesamt } = await eintraegeLaden(art, { ordnerIds: ordnerId ? ordnerMitNachfahren(aktive, ordnerId) : null, q, archiv });
  const baum = ordnerBaum(aktive, zaehler.jeOrdner);
  const archivierteOrdner = archiv ? alleOrdner.filter((o) => o.archiviert) : [];
  const istMaterial = art === "material";

  const adresse = (teil: Record<string, string | null>) => {
    const p = new URLSearchParams({ art });
    if (q) p.set("q", q);
    if (archiv) p.set("archiv", "1");
    for (const [k, v] of Object.entries(teil)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/buero/katalog?${p}`;
  };
  const neuHref = `/buero/katalog/neu?art=${art}${ordnerId ? `&ordner=${ordnerId}` : ""}`;
  const exportHref = `/buero/katalog/export?art=${art}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Stammdaten</h1>
        <div className="flex flex-wrap items-center gap-2">
          <KalkulationFenster einstellungen={kalkulation} istAdmin={nutzer.rolle === "admin"} />
          {nutzer.rolle === "admin" && (
            <Link href={`/buero/katalog/import?art=${art}`} className={buttonVariants({ variant: "outline", className: "h-8 px-3 text-[13px]" })}>
              <UploadIcon className="size-3.5" /> Import
            </Link>
          )}
          <a href={exportHref} download className={buttonVariants({ variant: "outline", className: "h-8 px-3 text-[13px]" })}>
            <DownloadIcon className="size-3.5" /> Export
          </a>
          <Link href={neuHref} className={buttonVariants({ className: "h-8 px-3 text-[13px]" })}>
            <PlusIcon className="size-3.5 sm:hidden" /> {istMaterial ? "Neues Material" : "Neue Leistung"}
          </Link>
        </div>
      </div>

      <nav aria-label="Art" className="flex gap-5 border-b">
        {(["leistung", "material"] as const).map((a) => (
          <Link
            key={a}
            href={`/buero/katalog?art=${a}`}
            aria-current={a === art ? "page" : undefined}
            className={cn("-mb-px border-b-2 pb-2 text-[13px] transition-colors", a === art ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {KATALOG_ART_NAMEN[a]}
          </Link>
        ))}
      </nav>

      <div className="grid items-start gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="rounded-lg border bg-white p-1.5">
          <OrdnerBaum
            art={art}
            baum={baum}
            alle={aktive}
            gesamt={zaehler.gesamt}
            aktuell={ordnerId}
            adresseBasis={adresse({ ordner: null }).replace("/buero/katalog?", "")}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SuchFeld q={q} platzhalter={`Alle ${KATALOG_ART_NAMEN[art]} durchsuchen …`} className="w-72 max-w-full" />
            <Link
              href={adresse({ archiv: archiv ? null : "1" })}
              aria-pressed={archiv}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-[13px] hover:bg-muted", archiv ? "border-foreground/80" : "border-border")}
            >
              <ArchiveIcon className="size-3.5" /> {archiv ? "Archiv" : "Aktiv"}
            </Link>
          </div>

          <KatalogTabelle
            art={art}
            zeilen={zeilen.map((z) => ({
              id: z.id,
              name: z.name,
              nummer: z.nummer,
              einheit: z.einheit,
              preis: z.preis,
              zuschlag: z.zuschlag,
              vk: z.vk,
              info: [z.lieferant, ordnerId && !q ? "" : ordnerPfadText(alleOrdner, z.folderId)].filter(Boolean).join(" · "),
              aktualisiert: z.aktualisiert,
            }))}
            ordner={ordnerOptionen(aktive)}
            archiv={archiv}
            gesamt={gesamt}
            leerText={q || archiv ? "Nichts gefunden." : ordnerId ? "In diesem Ordner liegt noch nichts." : `Noch keine ${KATALOG_ART_NAMEN[art]}. Lege die erste mit „${istMaterial ? "Neues Material" : "Neue Leistung"}“ an.`}
          />
          {gesamt > MAX_ZEILEN && <span className="sr-only">Es werden die ersten {MAX_ZEILEN} gezeigt.</span>}

          {archiv && archivierteOrdner.length > 0 && (
            <section aria-labelledby="arch-ordner-titel" className="flex flex-col gap-2">
              <h2 id="arch-ordner-titel" className="text-[15px] font-semibold">Archivierte Ordner</h2>
              <div className="divide-y rounded-lg border bg-white">
                {archivierteOrdner.map((o) => (
                  <OrdnerZeile key={o.id} art={art} ordner={o} alle={alleOrdner} archiviert pfadText={ordnerPfadText(alleOrdner, o.id)} href="#" />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
