import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { firmaLaden } from "@/lib/firma-daten";
import { FirmaFormular } from "./formular";

export const metadata: Metadata = { title: "Firmendaten" };

export default async function FirmaSeite() {
  await requireRole(["admin"]);
  const firma = await firmaLaden();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/buero/einstellungen" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Einstellungen
        </Link>
        <h1 className="text-2xl font-semibold">Firmendaten</h1>
        <p className="text-muted-foreground">
          Diese Angaben erscheinen auf Angeboten: Absenderzeile, Firmenblock oben rechts und die Fußzeile mit Steuer- und Bankdaten.
        </p>
      </div>
      <FirmaFormular firma={firma} />
    </div>
  );
}
