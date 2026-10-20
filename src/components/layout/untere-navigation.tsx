"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDaysIcon, ClockIcon, FolderOpenIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";

// `auch`: weitere Pfade, bei denen der Reiter als aktiv gilt (Termine gehören zu den Einsätzen, Urlaub zu den Zeiten).
const EINTRAEGE = [
  { href: "/heute", name: "Einsätze", icon: CalendarDaysIcon, auch: ["/termine"] },
  { href: "/baustellen", name: "Projekte", icon: FolderOpenIcon, auch: [] },
  { href: "/zeiten", name: "Zeiten", icon: ClockIcon, auch: ["/urlaub"] },
  { href: "/kontakte", name: "Kontakte", icon: UsersIcon, auch: [] },
] as const;

/** Untere Navigation der Mitarbeiter-App: 4 große Felder, kein Untermenü. */
export function UntereNavigation() {
  const pfad = usePathname();

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {EINTRAEGE.map(({ href, name, icon: Icon, auch }) => {
          const aktiv = [href, ...auch].some((p) => pfad === p || pfad.startsWith(`${p}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={aktiv ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  aktiv ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-6", aktiv && "stroke-[2.25]")} />
                {name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
