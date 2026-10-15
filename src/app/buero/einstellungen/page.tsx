import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, UserCogIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Einstellungen" };

const SPAETER = [
  "Firmendaten, Logo & Briefpapier",
  "Nummernkreise",
  "Zahlungsziel, Anfangs- und Schlusstexte",
  "E-Mail-Vorlagen",
  "Fahrzeuge",
  "Arbeitszeitmodelle & Feiertage",
  "Projektstatus",
];

export default async function EinstellungenSeite() {
  // Doppelt hält besser: auch die Seite selbst prüft die Rolle.
  await requireRole(["admin"]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Einstellungen</h1>

      <Link
        href="/buero/einstellungen/benutzer"
        className="flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-muted"
      >
        <UserCogIcon className="size-6 text-muted-foreground" />
        <div className="flex-1">
          <p className="font-medium">Benutzer & Rollen</p>
          <p className="text-sm text-muted-foreground">
            Mitarbeiter anlegen, Rollen ändern, Zugänge sperren
          </p>
        </div>
        <ChevronRightIcon className="size-5 text-muted-foreground" />
      </Link>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">Kommt später</p>
        <ul className="flex flex-col divide-y rounded-xl border text-muted-foreground">
          {SPAETER.map((eintrag) => (
            <li key={eintrag} className="px-4 py-3 text-sm">
              {eintrag}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
