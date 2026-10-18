"use client";

import type { ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Filterknopf wie in Plancraft: Symbol, Beschriftung, Pfeil; öffnet darunter ein Fenster. Mit gesetztem Filter dunkler Rand. */
export function FilterKnopf({
  icon,
  label,
  aktiv = false,
  anzahl,
  children,
  breite = "w-64",
}: {
  icon?: ReactNode;
  label: string;
  aktiv?: boolean;
  anzahl?: number;
  children: ReactNode;
  breite?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-2.5 text-[13px] whitespace-nowrap transition-colors hover:bg-muted data-popup-open:bg-muted [&_svg]:size-3.5",
          aktiv ? "border-foreground/80" : "border-border",
        )}
      >
        {icon}
        <span className="max-w-56 truncate">{label}</span>
        {anzahl ? <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium">{anzahl}</span> : null}
        <ChevronDownIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", breite)}>{children}</PopoverContent>
    </Popover>
  );
}
