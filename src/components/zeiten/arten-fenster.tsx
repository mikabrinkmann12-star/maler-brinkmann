"use client";

import { ArrowRightIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { stundenHM } from "@/lib/listen-anzeige";
import { ZEIT_ARTEN, ZEIT_ART_NAMEN, type ZeitArt } from "@/lib/zeiten";

/** „Alle Zeitarten →“: Seitenfenster mit den Summen jeder Zeitart (Stunden, bei Urlaub/Krank/Feiertag auch Tage). */
export function ArtenFenster({ summen }: { summen: Partial<Record<ZeitArt, { stunden: number; tage: number }>> }) {
  return (
    <Sheet>
      <SheetTrigger className="flex items-center gap-1 text-[13px] font-semibold hover:underline">
        Alle Zeitarten <ArrowRightIcon className="size-3.5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-80 gap-0">
        <SheetHeader>
          <SheetTitle>Alle Arten</SheetTitle>
          <SheetDescription>Summierte Stunden der angezeigten Zeiteinträge.</SheetDescription>
        </SheetHeader>
        <table className="mx-4 mt-2 text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Art</th>
              <th className="py-2 text-right font-medium">Stunden</th>
              <th className="w-20 py-2" />
            </tr>
          </thead>
          <tbody>
            {ZEIT_ARTEN.map((a) => {
              const s = summen[a];
              const zeigeTage = a === "urlaub" || a === "krank" || a === "feiertag" || a === "unbezahlter_urlaub" || a === "ueberstundenabbau";
              return (
                <tr key={a} className="border-b last:border-b-0">
                  <td className="py-2">{ZEIT_ART_NAMEN[a]}</td>
                  <td className="py-2 text-right tabular-nums">{s ? stundenHM(s.stunden) : "-"}</td>
                  <td className="py-2 pl-3 text-xs text-muted-foreground">{s && zeigeTage ? `(${s.tage} ${s.tage === 1 ? "Tag" : "Tage"})` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SheetContent>
    </Sheet>
  );
}
