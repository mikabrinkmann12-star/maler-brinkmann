"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusIcon, SettingsIcon, TimerIcon } from "lucide-react";
import { cn } from "cn";

// Obere Leiste der Mitarbeiter-App (wie Plancraft): Zahnrad links, Titel in der Mitte,
// Aktion rechts. Sie erscheint nur auf den vier Reitern; Unterseiten haben ihren
// eigenen Kopf (`SeitenKopf`).

type Reiter = { pfade: string[]; titel: string; aktion?: { href: string; name: string }; nurBuero?: boolean };

const REITER: Reiter[] = [
  // Das Plus bei den Einsätzen gibt es nur für Büro/Admin (Einteilung); Mitarbeiter tragen Termine über den Link auf der Seite ein.
  { pfade: ["/heute"], titel: "Einsätze", aktion: { href: "/buero/plantafel", name: "Einteilung öffnen" }, nurBuero: true },
  { pfade: ["/baustellen"], titel: "Projekte" },
  // Zeiten hat drei Reiter (Zeiten, Urlaubsanträge, Stundenkonto); „Neue Zeit“ gibt es nicht bei den Urlaubsanträgen
  { pfade: ["/zeiten", "/zeiten/konto"], titel: "Zeiten", aktion: { href: "/zeiten/neu", name: "Neue Zeit" } },
  { pfade: ["/urlaub"], titel: "Zeiten" },
  { pfade: ["/kontakte"], titel: "Kontakte" },
];

/** Der Reiter, dessen Hauptseite gerade offen ist (nicht die Unterseiten). */
function aktuellerReiter(pfad: string): Reiter | undefined {
  return REITER.find((r) => r.pfade.includes(pfad));
}

export function TabKopf({ istBuero = false }: { istBuero?: boolean }) {
  const reiter = aktuellerReiter(usePathname());
  if (!reiter) return null;
  const aktion = reiter.nurBuero && !istBuero ? undefined : reiter.aktion;

  return (
    <header className="sticky top-0 z-30 border-b bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto grid h-14 max-w-lg grid-cols-[3rem_1fr_3rem] items-center px-2">
        <Link
          href="/einstellungen"
          aria-label="Einstellungen"
          className="flex size-12 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
        >
          <SettingsIcon className="size-6" />
        </Link>
        <h1 className="truncate text-center text-lg font-semibold">{reiter.titel}</h1>
        {aktion ? (
          <Link
            href={aktion.href}
            aria-label={aktion.name}
            className="flex size-12 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted"
          >
            <PlusIcon className="size-7 stroke-[2.5]" />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </header>
  );
}

/** Schwebender Stoppuhr-Knopf unten rechts auf den vier Reitern. */
export function ZeiterfassungKnopf({ href }: { href: string }) {
  const sichtbar = aktuellerReiter(usePathname());
  if (!sichtbar) return null;
  return (
    <Link
      href={href}
      aria-label="Zeiterfassung"
      className={cn(
        "fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95",
      )}
    >
      <TimerIcon className="size-7" />
    </Link>
  );
}
