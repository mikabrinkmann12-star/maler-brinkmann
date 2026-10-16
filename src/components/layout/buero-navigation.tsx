"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  ClockIcon,
  FileTextIcon,
  FolderKanbanIcon,
  LibraryIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  TreePalmIcon,
  UsersIcon,
} from "lucide-react";
import { cn } from "cn";

const EINTRAEGE = [
  { href: "/buero", name: "Übersicht", icon: LayoutDashboardIcon, nurAdmin: false },
  { href: "/buero/plantafel", name: "Einteilung", icon: CalendarDaysIcon, nurAdmin: false },
  { href: "/buero/projekte", name: "Projekte", icon: FolderKanbanIcon, nurAdmin: false },
  { href: "/buero/angebote", name: "Angebote", icon: FileTextIcon, nurAdmin: false },
  { href: "/buero/kontakte", name: "Kontakte", icon: UsersIcon, nurAdmin: false },
  { href: "/buero/katalog", name: "Katalog", icon: LibraryIcon, nurAdmin: false },
  { href: "/buero/zeiten", name: "Zeiten", icon: ClockIcon, nurAdmin: false },
  { href: "/buero/urlaub", name: "Urlaub", icon: TreePalmIcon, nurAdmin: false },
  { href: "/buero/einstellungen", name: "Einstellungen", icon: SettingsIcon, nurAdmin: true },
] as const;

/**
 * Menü der Büro-Ansicht. „Einstellungen“ wird nur dem Admin angezeigt.
 * Das ist reine Bequemlichkeit: Der Zugriff selbst wird serverseitig geprüft.
 */
export function BueroNavigation({
  istAdmin,
  onNavigiert,
}: {
  istAdmin: boolean;
  onNavigiert?: () => void;
}) {
  const pfad = usePathname();

  return (
    <nav aria-label="Büro-Navigation">
      <ul className="flex flex-col gap-1">
        {EINTRAEGE.filter((e) => istAdmin || !e.nurAdmin).map(
          ({ href, name, icon: Icon }) => {
            const aktiv =
              href === "/buero"
                ? pfad === href
                : pfad === href || pfad.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigiert}
                  aria-current={aktiv ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                    aktiv
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  {name}
                </Link>
              </li>
            );
          },
        )}
      </ul>
    </nav>
  );
}
