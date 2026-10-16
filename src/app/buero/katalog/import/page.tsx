import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { KATALOG_ART_NAMEN, istKatalogArt, type KatalogArt } from "@/lib/katalog";
import { katalogSchluesselLaden } from "@/lib/katalog-daten";
import { ImportAssistent } from "./import-assistent";

export const metadata: Metadata = { title: "Katalog importieren" };

export default async function KatalogImportSeite({ searchParams }: PageProps<"/buero/katalog/import">) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const art: KatalogArt = istKatalogArt(params.art) ? params.art : "material";
  const schluessel = await katalogSchluesselLaden(art);

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <Link href={`/buero/katalog?art=${art}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Katalog
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{KATALOG_ART_NAMEN[art]} importieren</h1>
        <p className="text-muted-foreground">
          CSV-Datei wählen (z. B. aus Excel gespeichert als „CSV“). Du siehst erst eine Vorschau, importiert wird nur, was neu ist.
          Vorhandene Einträge werden nie überschrieben. Fehlende Ordner werden angelegt. Gleichnamige Einträge mit anderem Preis zählen als eigener Eintrag.
        </p>
      </div>
      <ImportAssistent art={art} bestehendeSchluessel={[...schluessel]} anzahlBestehend={schluessel.size} />
    </div>
  );
}
