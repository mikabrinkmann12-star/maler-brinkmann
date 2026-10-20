"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDaysIcon, ClockIcon, FolderOpenIcon, UsersIcon } from "lucide-react";
import { cn } from "cn";
import { rechtOk, type Rechte } from "@/lib/rechte";

// `auch`: weitere Pfade, bei denen der Reiter als aktiv gilt (Termine gehören zu den Einsätzen, Urlaub zu den Zeiten).
// `rechte`: der Reiter erscheint, wenn der Nutzer mindestens eines dieser Rechte hat (Einsätze: immer, dort steht auch „Container melden“).
const EINTRAEGE = [
  { href: "/heute", name: "Einsätze", icon: CalendarDaysIcon, auch: ["/termine"], rechte: [] as string[] },
  { href: "/baustellen", name: "Projekte", icon: FolderOpenIcon, auch: [], rechte: ["projekte_ansehen", "archiv_ansehen"] },
  { href: "/zeiten", name: "Zeiten", icon: ClockIcon, auch: ["/urlaub"], rechte: ["zeiten_eigene", "urlaub_beantragen"] },
  { href: "/kontakte", name: "Kontakte", icon: UsersIcon, auch: [], rechte: ["kontakte_ansehen"] },
] as const;

/** Untere Navigation der Mitarbeiter-App: 4 große Felder, kein Untermenü. */
export function UntereNavigation({ rechte }: { rechte: Rechte }) {
  const pfad = usePathname();
  const eintraege = EINTRAEGE.filter((e) => e.rechte.length === 0 || e.rechte.some((r) => rechtOk(rechte, r)));

  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${eintraege.length}, minmax(0, 1fr))` }}>
        {eintraege.map(({ href, name, icon: Icon, auch }) => {
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
