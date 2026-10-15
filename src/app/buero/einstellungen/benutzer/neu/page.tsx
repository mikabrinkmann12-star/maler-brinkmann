import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { startpasswortErzeugen } from "@/lib/passwort";
import { NeuerNutzerBereich } from "./neuer-nutzer-formular";

export const metadata: Metadata = { title: "Neuer Benutzer" };

export default async function NeuerBenutzerSeite() {
  await requireRole(["admin"]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/buero/einstellungen/benutzer"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Benutzer & Rollen
        </Link>
        <h1 className="text-2xl font-semibold">Neuer Benutzer</h1>
      </div>
      {/* Startpasswort auf dem Server erzeugt → kein Unterschied zwischen Server und Browser */}
      <NeuerNutzerBereich startPasswort={startpasswortErzeugen()} />
    </div>
  );
}
