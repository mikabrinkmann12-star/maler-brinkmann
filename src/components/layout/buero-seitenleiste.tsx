"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDownIcon, HardHatIcon, KeyRoundIcon, LogOutIcon, PanelLeftIcon, SettingsIcon, UserPlusIcon, BuildingIcon } from "lucide-react";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { abmelden } from "@/lib/auth-aktionen";
import { ROLLEN_NAMEN, type Rolle } from "@/lib/rollen";
import { BueroNavigation } from "./buero-navigation";

const KREIS_FARBEN = ["#e9b8d4", "#b8d4e9", "#d4e9b8", "#e9d4b8", "#c9b8e9", "#b8e9d4"];

/** Initialen (z. B. „RB“) und eine feste Pastellfarbe je Person. */
function kreis(name: string) {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  const initialen = ((teile[0]?.[0] ?? "") + (teile.length > 1 ? teile[teile.length - 1][0] : "")).toUpperCase() || "?";
  let summe = 0;
  for (const z of name) summe += z.charCodeAt(0);
  return { initialen, farbe: KREIS_FARBEN[summe % KREIS_FARBEN.length] };
}

/**
 * Seitenleiste der Büro-Ansicht im Stil von Plancraft: oben Firma (mit Menü) und Knopf zum Ein-/Ausklappen, dann das Menü,
 * unten Einstellungen und der Nutzer-Kreis mit Menü (Mitarbeiter-Ansicht, Passwort, Abmelden).
 */
export function BueroSeitenleiste({
  firmenname,
  name,
  rolle,
  eingeklappt = false,
  onUmschalten,
  onNavigiert,
}: {
  firmenname: string;
  name: string;
  rolle: Rolle;
  eingeklappt?: boolean;
  onUmschalten?: () => void;
  onNavigiert?: () => void;
}) {
  const { initialen, farbe } = kreis(name);
  const istAdmin = rolle === "admin";

  return (
    <div className="flex h-full flex-col gap-3 p-2.5">
      <div className={cn("flex items-center gap-2", eingeklappt && "flex-col")}>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-white/7",
              eingeklappt && "flex-none",
            )}
            aria-label="Unternehmen"
          >
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
              <Image src="/logo.png" alt="" width={700} height={382} className="h-auto w-7" />
            </span>
            {!eingeklappt && (
              <>
                <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-tight text-white/75">{firmenname}</span>
                <ChevronDownIcon className="size-3.5 shrink-0 text-white/50" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{firmenname}</DropdownMenuLabel>
              {istAdmin ? (
                <>
                  <DropdownMenuItem render={<Link href="/buero/einstellungen" />}><SettingsIcon /> Einstellungen</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/buero/einstellungen/firma" />}><BuildingIcon /> Unternehmensdetails</DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/buero/einstellungen/benutzer/neu" />}><UserPlusIcon /> Mitarbeiter einladen</DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem render={<Link href="/buero" />}>Übersicht</DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {onUmschalten && (
          <button
            type="button"
            onClick={onUmschalten}
            aria-label={eingeklappt ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"}
            title={eingeklappt ? "Ausklappen" : "Einklappen"}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PanelLeftIcon className="size-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto border-t border-sidebar-border pt-3">
        <BueroNavigation eingeklappt={eingeklappt} onNavigiert={onNavigiert} />
      </div>

      <div className={cn("flex items-center gap-1 border-t border-sidebar-border pt-3", eingeklappt && "flex-col")}>
        {istAdmin && (
          <Link
            href="/buero/einstellungen"
            onClick={onNavigiert}
            aria-label="Einstellungen"
            title="Einstellungen"
            className="flex size-8 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <SettingsIcon className="size-[18px]" />
          </Link>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Mein Konto"
            title={name}
            className={cn("flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-white/7", !eingeklappt && "ml-auto")}
          >
            <span className="flex size-7 items-center justify-center rounded-full text-[11px] font-semibold text-neutral-800" style={{ backgroundColor: farbe }}>
              {initialen}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start" side="top">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{name}</span>
                <span className="text-xs text-muted-foreground">{ROLLEN_NAMEN[rolle]}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/heute" onClick={onNavigiert} />}><HardHatIcon /> Zur Mitarbeiter-Ansicht</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/passwort-aendern" onClick={onNavigiert} />}><KeyRoundIcon /> Passwort ändern</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<form action={abmelden} />}>
              <button type="submit" className="flex w-full items-center gap-1.5 text-left"><LogOutIcon className="size-4" /> Abmelden</button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
