"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  HouseIcon,
  LayersIcon,
  PlusIcon,
  ReceiptTextIcon,
  UsersIcon,
} from "lucide-react";
import { cn } from "cn";

type Eintrag = {
  href: string;
  name: string;
  icon: typeof HouseIcon;
  /** Kleines „+“ rechts beim Darüberfahren (wie in Plancraft): legt direkt etwas Neues an. */
  plus?: { href: string; titel: string };
  neu?: boolean;
  /** Weitere Pfade, bei denen der Eintrag als aktiv gilt (z. B. Urlaubsanträge gehören zu „Zeiten“). */
  auch?: string[];
};

// Reihenfolge wie in Plancraft: Übersicht, Plantafel („Einteilung“), Projekte, Angebote, Rechnungen, Zeiten, Stammdaten, Kontakte.
const EINTRAEGE: Eintrag[] = [
  { href: "/buero", name: "Übersicht", icon: HouseIcon },
  { href: "/buero/plantafel", name: "Einteilung", icon: CalendarDaysIcon },
  { href: "/buero/projekte", name: "Projekte", icon: FolderIcon, plus: { href: "/buero/projekte/neu", titel: "Neues Projekt" } },
  { href: "/buero/angebote", name: "Angebote", icon: FileTextIcon },
  { href: "/buero/rechnungen", name: "Rechnungen", icon: ReceiptTextIcon },
  { href: "/buero/zeiten", name: "Zeiten", icon: ClockIcon, plus: { href: "/buero/zeiten/neu", titel: "Neue Zeit" }, auch: ["/buero/urlaub"] },
  { href: "/buero/katalog", name: "Stammdaten", icon: LayersIcon, neu: true },
  { href: "/buero/kontakte", name: "Kontakte", icon: UsersIcon, plus: { href: "/buero/kontakte/neu", titel: "Neuer Kontakt" } },
];

/**
 * Menü der Büro-Ansicht (Aufbau und Verhalten wie Plancraft: aktiver Eintrag fett und weiß, beim Darüberfahren heller Grund
 * und bei Projekten, Zeiten und Kontakten ein „+“ zum direkten Anlegen). Eingeklappt bleiben nur die Symbole.
 */
export function BueroNavigation({
  eingeklappt = false,
  onNavigiert,
}: {
  eingeklappt?: boolean;
  onNavigiert?: () => void;
}) {
  const pfad = usePathname();

  return (
    <nav aria-label="Büro-Navigation">
      <ul className="flex flex-col gap-0.5">
        {EINTRAEGE.map(({ href, name, icon: Icon, plus, neu, auch = [] }) => {
          const aktiv =
            href === "/buero"
              ? pfad === href
              : [href, ...auch].some((h) => pfad === h || pfad.startsWith(`${h}/`));
          return (
            <li key={href} className="group/eintrag relative">
              <Link
                href={href}
                onClick={onNavigiert}
                title={eingeklappt ? name : undefined}
                aria-current={aktiv ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] transition-colors",
                  eingeklappt && "justify-center px-0",
                  aktiv ? "font-semibold text-white" : "text-white/65 hover:bg-white/7 hover:text-white",
                )}
              >
                <Icon className={cn("size-[18px] shrink-0", aktiv && "stroke-[2.4]")} />
                {!eingeklappt && (
                  <>
                    <span className="truncate">{name}</span>
                    {neu && <span className="rounded-full bg-blue-400/25 px-1.5 text-[10px] font-medium text-blue-200">Neu</span>}
                  </>
                )}
              </Link>
              {plus && !eingeklappt && (
                <Link
                  href={plus.href}
                  onClick={onNavigiert}
                  aria-label={plus.titel}
                  title={plus.titel}
                  className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded text-white/70 opacity-0 transition-opacity group-hover/eintrag:opacity-100 hover:bg-white/10 hover:text-white focus-visible:opacity-100"
                >
                  <PlusIcon className="size-4" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
