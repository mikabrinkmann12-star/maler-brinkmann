import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { dublettenSchluessel } from "@/lib/kontakt-import";
import { createClient } from "@/lib/supabase/server";
import { ImportAssistent } from "./import-assistent";

export const metadata: Metadata = { title: "Kontakte importieren" };

export default async function KontakteImportSeite() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("kundennummer, firmenname, vorname, nachname, strasse, plz");
  const bestehende = data ?? [];

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <Link href="/buero/kontakte" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Kontakte
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Kontakte importieren</h1>
        <p className="text-muted-foreground">
          CSV-Datei aus Plancraft (Kontakte exportieren). Du siehst erst eine Vorschau, importiert wird nur, was neu ist.
          Bestehende Kontakte werden nie überschrieben.
        </p>
      </div>
      <ImportAssistent
        bestehendeNummern={bestehende.map((b) => b.kundennummer).filter((n): n is string => Boolean(n))}
        bestehendeSchluessel={bestehende.map((b) =>
          dublettenSchluessel({ firmenname: b.firmenname ?? "", vorname: b.vorname ?? "", nachname: b.nachname ?? "", strasse: b.strasse ?? "", plz: b.plz ?? "" }),
        )}
        anzahlBestehend={bestehende.length}
      />
    </div>
  );
}
