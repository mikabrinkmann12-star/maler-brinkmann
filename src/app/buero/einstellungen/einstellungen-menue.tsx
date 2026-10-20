"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2Icon,
  CalculatorIcon,
  CalendarHeartIcon,
  ClockIcon,
  FileStackIcon,
  FileTextIcon,
  HashIcon,
  ReceiptTextIcon,
  InboxIcon,
  KeyRoundIcon,
  PlugIcon,
  RulerIcon,
  ShieldCheckIcon,
  TagsIcon,
  UsersIcon,
} from "lucide-react";
import { cn } from "cn";
import { rechtOk, type Rechte } from "@/lib/rechte";

/** `recht`: Recht, mit dem auch das Büro den Eintrag sieht. Ohne `recht` sieht ihn nur der Admin (Nutzerverwaltung, Rechte, Anbindungen). */
type Eintrag = { href: string; name: string; icon: typeof UsersIcon; recht?: string };

// Gruppen wie in Plancraft: Unternehmen, Layout & Textvorlagen, Buchhaltung & Rechnungswesen, Kalkulation.
const GRUPPEN: { titel: string; eintraege: Eintrag[] }[] = [
  {
    titel: "Unternehmen",
    eintraege: [
      { href: "/buero/einstellungen/benutzer", name: "Mitarbeiter", icon: UsersIcon },
      { href: "/buero/einstellungen/firma", name: "Unternehmen", icon: Building2Icon, recht: "einstellungen_firma" },
      { href: "/buero/einstellungen/zeiterfassung", name: "Arbeitszeiten", icon: ClockIcon, recht: "einstellungen_firma" },
      { href: "/buero/einstellungen/feiertage", name: "Feiertage", icon: CalendarHeartIcon, recht: "einstellungen_firma" },
      { href: "/buero/einstellungen/rollen", name: "Rollen & Zugriffsrechte", icon: ShieldCheckIcon },
      { href: "/buero/einstellungen/projektstatus", name: "Projektstatus", icon: TagsIcon, recht: "einstellungen_firma" },
      { href: "/buero/einstellungen/sevdesk", name: "Buchhaltung (sevdesk)", icon: PlugIcon },
      { href: "/buero/einstellungen/lexware", name: "Lexware (alt)", icon: PlugIcon },
      { href: "/buero/einstellungen/postfach", name: "Postfach für Rechnungen", icon: InboxIcon },
      { href: "/buero/einstellungen/schnittstelle", name: "Schnittstelle (API)", icon: KeyRoundIcon },
    ],
  },
  {
    titel: "Layout & Textvorlagen",
    eintraege: [
      { href: "/buero/einstellungen/angebote", name: "Angebote – Vorgaben", icon: FileTextIcon, recht: "einstellungen_firma" },
      { href: "/buero/einstellungen/textvorlagen", name: "Anfangs- & Schlusstexte", icon: FileStackIcon, recht: "einstellungen_firma" },
    ],
  },
  {
    titel: "Buchhaltung & Rechnungswesen",
    eintraege: [
      { href: "/buero/einstellungen/nummernkreise", name: "Nummernkreise", icon: HashIcon, recht: "einstellungen_firma" },
      { href: "/buero/einstellungen/rechnungen", name: "Rechnungen – Vorgaben", icon: ReceiptTextIcon, recht: "einstellungen_firma" },
    ],
  },
  {
    titel: "Kalkulation",
    eintraege: [
      { href: "/buero/einstellungen/kalkulation", name: "Lohngruppen & Zuschläge", icon: CalculatorIcon, recht: "kalkulation_aendern" },
      { href: "/buero/einstellungen/einheiten", name: "Einheiten", icon: RulerIcon, recht: "einstellungen_firma" },
    ],
  },
];

/** Menü der Einstellungen links (wie in Plancraft, gruppiert); am Handy steht es über dem Inhalt. */
export function EinstellungenMenue({ istAdmin, rechte }: { istAdmin: boolean; rechte: Rechte }) {
  const pfad = usePathname();
  const sichtbar = (e: Eintrag) => istAdmin || (e.recht !== undefined && rechtOk(rechte, e.recht));
  return (
    <nav aria-label="Einstellungen" className="flex flex-col gap-4">
      {GRUPPEN.filter((g) => g.eintraege.some(sichtbar)).map((g) => (
        <div key={g.titel} className="flex flex-col gap-0.5">
          <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.titel}</p>
          {g.eintraege.filter(sichtbar).map(({ href, name, icon: Icon }) => {
            const aktiv = pfad === href || pfad.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={aktiv ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                  aktiv ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{name}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
