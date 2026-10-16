import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { materialSchluesselLaden } from "@/lib/katalog-daten";
import { ImportAssistent } from "./import-assistent";

export const metadata: Metadata = { title: "Materialien importieren" };

export default async function KatalogImportSeite() {
  await requireRole(["admin"]);
  const schluessel = await materialSchluesselLaden();

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <Link href="/buero/katalog" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Katalog
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Materialien importieren</h1>
        <p className="text-muted-foreground">
          CSV-Datei wählen (z. B. aus Excel gespeichert als „CSV“). Du siehst erst eine Vorschau, importiert wird nur, was neu ist.
          Vorhandene Materialien werden nie überschrieben. Fehlende Ordner werden angelegt.
        </p>
      </div>
      <ImportAssistent bestehendeSchluessel={[...schluessel]} anzahlBestehend={schluessel.size} />
    </div>
  );
}
