import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";
import { ZeiterfassungFormular } from "./formular";

export const metadata: Metadata = { title: "Zeiterfassung" };

export default async function ZeiterfassungEinstellungenSeite() {
  await requireRole(["admin"]);
  const einstellungen = await zeiterfassungEinstellungen();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/buero/einstellungen"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Einstellungen
        </Link>
        <h1 className="text-2xl font-semibold">Zeiterfassung</h1>
        <p className="text-muted-foreground">
          Gilt für die Mitarbeiter-App. Das Büro darf immer alle Arten und alle Tage eintragen.
        </p>
      </div>
      <ZeiterfassungFormular werte={einstellungen} />
    </div>
  );
}
