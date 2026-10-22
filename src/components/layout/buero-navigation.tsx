"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  BotIcon,
  SearchIcon,
  CalendarDaysIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  HouseIcon,
  LayersIcon,
  InboxIcon,
  PhoneIcon,
  PlusIcon,
  ReceiptTextIcon,
  UsersIcon,
} from "lucide-react";
import { cn } from "cn";
import { rechtOk } from "@/lib/rechte";
import { BENACHRICHTIGUNGEN_OEFFNEN, NEUE_ZEIT_OEFFNEN, SUCHE_OEFFNEN, useBuero } from "./buero-kontext";

type Eintrag = {
  href: string;
  name: string;
  icon: typeof HouseIcon;
  /** Recht, das für den Menüeintrag nötig ist (ohne: immer sichtbar) */
  recht?: string;
  /** Kleines „+“ rechts beim Darüberfahren (wie in Plancraft): legt direkt etwas Neues an. */
  plus?: { href: string; titel: string; /** Recht fürs Anlegen */ recht?: string; /** Öffnet statt der Seite ein Fenster (Ereignis aus buero-kontext) */ ereignis?: string };
  neu?: boolean;
  /** Nur für den Admin sichtbar (die Seite prüft das selbst nochmal) */
  nurAdmin?: boolean;
  /** Weitere Pfade, bei denen der Eintrag als aktiv gilt (z. B. Urlaubsanträge gehören zu „Zeiten“). */
  auch?: string[];
};

// Reihenfolge wie in Plancraft: Übersicht, Plantafel („Einteilung“), Projekte, Angebote, Ausgangs- und Eingangsrechnungen, Zeiten, Stammdaten, Kontakte.
const EINTRAEGE: Eintrag[] = [
  { href: "/buero", name: "Übersicht", icon: HouseIcon },
  { href: "/buero/plantafel", name: "Einteilung", icon: CalendarDaysIcon, recht: "einteilung_bearbeiten" },
  { href: "/buero/projekte", name: "Projekte", icon: FolderIcon, recht: "projekte_ansehen", plus: { href: "/buero/projekte/neu", titel: "Neues Projekt", recht: "projekte_bearbeiten" } },
  { href: "/buero/angebote", name: "Angebote", icon: FileTextIcon, recht: "angebote" },
  { href: "/buero/rechnungen", name: "Ausgangsrechnungen", icon: ReceiptTextIcon, recht: "rechnungen" },
  { href: "/buero/eingangsrechnungen", name: "Eingangsrechnungen", icon: InboxIcon, recht: "eingangsrechnungen" },
  { href: "/buero/zeiten", name: "Zeiten", icon: ClockIcon, recht: "zeiten_alle", plus: { href: "/buero/zeiten/neu", titel: "Neue Zeit", recht: "zeiten_alle", ereignis: NEUE_ZEIT_OEFFNEN }, auch: ["/buero/urlaub"] },
  { href: "/buero/katalog", name: "Stammdaten", icon: LayersIcon, recht: "katalog", neu: true },
  { href: "/buero/ki-system", name: "KI-System", icon: BotIcon, nurAdmin: true },
  { href: "/buero/kontakte", name: "Kontakte", icon: UsersIcon, recht: "kontakte_ansehen", plus: { href: "/buero/kontakte/neu", titel: "Neuer Kontakt", recht: "kontakte_bearbeiten" } },
  { href: "/buero/anrufe", name: "Anrufe", icon: PhoneIcon, recht: "buero_zugang" },
];

/**
 * Menü der Büro-Ansicht (Aufbau und Verhalten wie Plancraft: aktiver Eintrag fett und weiß, beim Darüberfahren heller Grund
 * und bei Projekten, Zeiten und Kontakten ein „+“ zum direkten Anlegen). Eingeklappt bleiben nur die Symbole.
 */
export function BueroNavigation({
  eingeklappt = false,
  istAdmin = false,
  onNavigiert,
}: {
  eingeklappt?: boolean;
  istAdmin?: boolean;
  onNavigiert?: () => void;
}) {
  const pfad = usePathname();

  const { ungelesen, rechte } = useBuero();

  /** „Suchen“ und „Benachrichtigungen“ stehen wie in Plancraft ganz oben und öffnen ein Fenster statt einer Seite. */
  const fensterKnopf = (ereignis: string, name: string, Icon: typeof HouseIcon, zusatz?: React.ReactNode) => (
    <li key={ereignis}>
      <button
        type="button"
        onClick={() => {
          onNavigiert?.();
          window.dispatchEvent(new Event(ereignis));
        }}
        title={eingeklappt ? name : undefined}
        className={cn(
          "flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-[13px] text-white/65 transition-colors hover:bg-white/7 hover:text-white",
          eingeklappt && "justify-center px-0",
        )}
      >
        <span className="relative">
          <Icon className="size-[18px] shrink-0" />
          {ungelesen > 0 && ereignis === BENACHRICHTIGUNGEN_OEFFNEN && (
            <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
              {ungelesen > 99 ? "99+" : ungelesen}
            </span>
          )}
        </span>
        {!eingeklappt && (
          <>
            <span className="truncate">{name}</span>
            {zusatz}
          </>
        )}
      </button>
    </li>
  );

  return (
    <nav aria-label="Büro-Navigation">
      <ul className="flex flex-col gap-0.5">
        {fensterKnopf(SUCHE_OEFFNEN, "Suchen", SearchIcon, <kbd className="ml-auto rounded border border-white/20 px-1 text-[10px] font-normal text-white/45">Strg K</kbd>)}
        {fensterKnopf(
          BENACHRICHTIGUNGEN_OEFFNEN,
          "Benachrichtigungen",
          BellIcon,
        )}
        <li aria-hidden className="my-1 h-px bg-sidebar-border" />
        {EINTRAEGE.filter((e) => (!e.nurAdmin || istAdmin) && (!e.recht || rechtOk(rechte, e.recht))).map(({ href, name, icon: Icon, plus: plusEintrag, neu, auch = [] }) => {
          // Das „+“ gibt es nur, wenn der Nutzer auch anlegen darf
          const plus = plusEintrag && (!plusEintrag.recht || rechtOk(rechte, plusEintrag.recht)) ? plusEintrag : undefined;
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
                plus.ereignis ? (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigiert?.();
                      window.dispatchEvent(new CustomEvent(plus.ereignis as string));
                    }}
                    aria-label={plus.titel}
                    title={plus.titel}
                    className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded text-white/70 opacity-0 transition-opacity group-hover/eintrag:opacity-100 hover:bg-white/10 hover:text-white focus-visible:opacity-100"
                  >
                    <PlusIcon className="size-4" />
                  </button>
                ) : (
                  <Link
                    href={plus.href}
                    onClick={onNavigiert}
                    aria-label={plus.titel}
                    title={plus.titel}
                    className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded text-white/70 opacity-0 transition-opacity group-hover/eintrag:opacity-100 hover:bg-white/10 hover:text-white focus-visible:opacity-100"
                  >
                    <PlusIcon className="size-4" />
                  </Link>
                )
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
