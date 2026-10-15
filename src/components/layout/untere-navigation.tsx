"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClockIcon, HardHatIcon, MenuIcon, SunIcon } from "lucide-react";
import { cn } from "cn";

const EINTRAEGE = [
  { href: "/heute", name: "Heute", icon: SunIcon },
  { href: "/baustellen", name: "Baustellen", icon: HardHatIcon },
  { href: "/zeiten", name: "Zeiten", icon: ClockIcon },
  { href: "/mehr", name: "Mehr", icon: MenuIcon },
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
        {EINTRAEGE.map(({ href, name, icon: Icon }) => {
          const aktiv = pfad === href || pfad.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={aktiv ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  aktiv ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("size-6", aktiv && "stroke-[2.5]")} />
                {name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
