import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { angebotEinstellungenLaden } from "@/lib/firma-daten";
import { AngebotEinstellungenFormular } from "./formular";

export const metadata: Metadata = { title: "Angebote – Vorgaben" };

export default async function AngebotEinstellungenSeite() {
  await requireRole(["admin"]);
  const werte = await angebotEinstellungenLaden();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/buero/einstellungen" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Einstellungen
        </Link>
        <h1 className="text-2xl font-semibold">Angebote – Vorgaben</h1>
        <p className="text-muted-foreground">
          Diese Texte und Werte werden in jedes <strong>neue</strong> Angebot kopiert. Bestehende Angebote ändern sich nicht.
        </p>
      </div>
      <AngebotEinstellungenFormular werte={werte} />
    </div>
  );
}
