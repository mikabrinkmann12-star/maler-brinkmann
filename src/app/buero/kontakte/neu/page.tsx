import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { kundennummerVorschlag } from "@/lib/kundennummer-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { LEERES_FORMULAR } from "@/lib/kontakt-formular";
import { KontaktFormular } from "../kontakt-formular";

export const metadata: Metadata = { title: "Neuer Kontakt" };

export default async function NeuerKontaktSeite() {
  await requireRole(BUERO_ROLLEN);
  const vorschlag = await kundennummerVorschlag();
  return (
    <div className="flex flex-col gap-5">
      <Link href="/buero/kontakte" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Kontakte
      </Link>
      <h1 className="text-2xl font-semibold">Neuer Kontakt</h1>
      <KontaktFormular id={null} start={{ ...LEERES_FORMULAR, kundennummer: vorschlag }} />
    </div>
  );
}
