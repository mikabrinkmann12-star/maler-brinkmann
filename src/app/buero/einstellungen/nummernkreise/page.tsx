import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { projektnummerStart, projektnummerVorschlag } from "@/lib/projektnummer-daten";
import { KUNDENNUMMER_BEISPIEL } from "@/lib/kundennummer";
import { NummernkreisFormular } from "./formular";

export const metadata: Metadata = { title: "Nummernkreise" };

export default async function NummernkreiseSeite() {
  await requireRole(["admin"]);
  const [start, vorschlag] = await Promise.all([projektnummerStart(), projektnummerVorschlag()]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/buero/einstellungen" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Einstellungen
        </Link>
        <h1 className="text-2xl font-semibold">Nummernkreise</h1>
        <p className="text-muted-foreground">
          Projektnummern haben das Format <strong>P-(2400)NNN</strong> (wie in Plancraft, der Kopf ist fest) und zählen ohne Neustart weiter.
          Kundennummern (z. B. {KUNDENNUMMER_BEISPIEL}) zählen automatisch ab der höchsten vorhandenen Nummer.
          Rechnungsnummern vergibt Lexware, nicht die App.
        </p>
      </div>
      <NummernkreisFormular start={start} vorschlag={vorschlag} />
    </div>
  );
}
