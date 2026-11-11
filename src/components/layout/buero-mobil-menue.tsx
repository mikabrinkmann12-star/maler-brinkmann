"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Rolle } from "@/lib/rollen";
import { BueroSeitenleiste } from "./buero-seitenleiste";

/** Kopfzeile der Büro-Ansicht auf dem Handy mit ausklappbarem Menü (dieselbe Seitenleiste wie am PC). */
export function BueroMobilMenue({ firmenname, name, rolle }: { firmenname: string; name: string; rolle: Rolle }) {
  const [offen, setOffen] = useState(false);
  const schliessen = () => setOffen(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-2 md:hidden">
      <Sheet open={offen} onOpenChange={setOffen}>
        <SheetTrigger render={<Button variant="ghost" size="icon-touch" aria-label="Menü öffnen" />}>
          <MenuIcon />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Menü</SheetTitle>
          <BueroSeitenleiste firmenname={firmenname} name={name} rolle={rolle} onNavigiert={schliessen} />
        </SheetContent>
      </Sheet>
      <AppLogo className="w-24" />
    </header>
  );
}
