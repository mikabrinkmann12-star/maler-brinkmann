"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Rolle } from "@/lib/rollen";
import { BueroNavigation } from "./buero-navigation";
import { NutzerBereich } from "./nutzer-bereich";

/** Kopfzeile der Büro-Ansicht auf dem Handy mit ausklappbarem Menü. */
export function BueroMobilMenue({ name, rolle }: { name: string; rolle: Rolle }) {
  const [offen, setOffen] = useState(false);
  const schliessen = () => setOffen(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-2 md:hidden">
      <Sheet open={offen} onOpenChange={setOffen}>
        <SheetTrigger
          render={<Button variant="ghost" size="icon-touch" aria-label="Menü öffnen" />}
        >
          <MenuIcon />
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col gap-4 bg-sidebar p-3">
          <div className="flex items-center gap-3 px-1 pt-1">
            <AppLogo />
            <SheetTitle>Maler Brinkmann</SheetTitle>
          </div>
          <div className="flex-1 overflow-y-auto">
            <BueroNavigation istAdmin={rolle === "admin"} onNavigiert={schliessen} />
          </div>
          <NutzerBereich name={name} rolle={rolle} onNavigiert={schliessen} />
        </SheetContent>
      </Sheet>
      <span className="font-semibold">Maler Brinkmann</span>
    </header>
  );
}
