"use client";

import { useState } from "react";
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDatum, formatMonat } from "@/lib/format";
import { monatVerschieben, monatsRaster } from "@/lib/zeitraum";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Ein einzelnes Datum wählen wie in Plancraft („Start ▾“ öffnet einen Monatskalender mit Kalenderwochen). Leer = kein Datum. */
export function DatumWahl({
  wert,
  onAendern,
  platzhalter,
  heute,
  className,
}: {
  wert: string;
  onAendern: (neu: string) => void;
  platzhalter: string;
  heute: string;
  className?: string;
}) {
  const start = wert || heute;
  const [anzeige, setAnzeige] = useState({ jahr: Number(start.slice(0, 4)), monat: Number(start.slice(5, 7)) });
  const monatText = formatMonat(`${anzeige.jahr}-${String(anzeige.monat).padStart(2, "0")}`).replace(/^./, (c) => c.toUpperCase());

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 w-full items-center gap-2 rounded-md border border-border bg-white px-2.5 text-left text-[13px] transition-colors hover:bg-muted data-popup-open:border-ring",
          !wert && "text-muted-foreground",
          className,
        )}
      >
        <span className="flex-1 truncate">{wert ? formatDatum(wert) : platzhalter}</span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Voriger Monat" onClick={() => setAnzeige(monatVerschieben(anzeige.jahr, anzeige.monat, -1))} className="flex size-6 items-center justify-center rounded hover:bg-muted">
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="text-[13px] font-medium">{monatText}</span>
          <button type="button" aria-label="Nächster Monat" onClick={() => setAnzeige(monatVerschieben(anzeige.jahr, anzeige.monat, 1))} className="flex size-6 items-center justify-center rounded hover:bg-muted">
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-[1.5rem_repeat(7,1fr)] gap-y-0.5 text-center text-[12px]">
          <span />
          {WOCHENTAGE.map((w) => <span key={w} className="text-muted-foreground">{w}</span>)}
          {monatsRaster(anzeige.jahr, anzeige.monat).map((w) => (
            <div key={w.kw} className="contents">
              <span className="self-center text-[10px] text-muted-foreground">{w.kw}</span>
              {w.tage.map((t, i) =>
                t ? (
                  <PopoverClose
                    key={t}
                    render={<button type="button" />}
                    onClick={() => onAendern(t)}
                    className={cn(
                      "h-7 rounded-sm text-[12px] transition-colors hover:bg-muted",
                      t === wert && "bg-primary font-medium text-primary-foreground hover:bg-primary",
                      t !== wert && t === heute && "font-semibold text-primary",
                    )}
                  >
                    {Number(t.slice(8))}
                  </PopoverClose>
                ) : (
                  <span key={i} />
                ),
              )}
            </div>
          ))}
        </div>
        {wert && (
          <PopoverClose render={<button type="button" />} onClick={() => onAendern("")} className="mt-2 flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            <XIcon className="size-3" /> Datum entfernen
          </PopoverClose>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Kleines Kalendersymbol für Beschriftungen. */
export const DatumSymbol = CalendarIcon;
