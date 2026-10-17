import type { Metadata } from "next";
import Link from "next/link";
import { Building2Icon, ChevronRightIcon, ClockIcon, FileTextIcon, HashIcon, ReceiptTextIcon, UserCogIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Einstellungen" };

const BEREICHE = [
  {
    href: "/buero/einstellungen/benutzer",
    titel: "Benutzer & Rollen",
    text: "Mitarbeiter anlegen, Rollen ändern, Zugänge sperren",
    icon: UserCogIcon,
  },
  {
    href: "/buero/einstellungen/zeiterfassung",
    titel: "Zeiterfassung",
    text: "Erlaubte Zeit-Arten, Standardzeiten, Sperrfrist",
    icon: ClockIcon,
  },
  {
    href: "/buero/einstellungen/nummernkreise",
    titel: "Nummernkreise",
    text: "Projektnummern: Startwert aus Plancraft, nächster Vorschlag",
    icon: HashIcon,
  },
  {
    href: "/buero/einstellungen/firma",
    titel: "Firmendaten",
    text: "Briefkopf, USt-ID, Steuernummer und Bank für Angebote",
    icon: Building2Icon,
  },
  {
    href: "/buero/einstellungen/angebote",
    titel: "Angebote – Vorgaben",
    text: "Anfangs- und Schlusstext, Reverse-Charge-Hinweis, Standard-Steuersatz",
    icon: FileTextIcon,
  },
  {
    href: "/buero/einstellungen/lexware",
    titel: "Lexware Office",
    text: "Verbindung für Rechnungen: Schlüssel prüfen, Test-Modus",
    icon: ReceiptTextIcon,
  },
] as const;

const SPAETER = [
  "Logo & Briefpapier",
  "Zahlungsziel",
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

      <ul className="flex flex-col gap-3">
        {BEREICHE.map(({ href, titel, text, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-muted">
              <Icon className="size-6 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">{titel}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
              <ChevronRightIcon className="size-5 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

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
