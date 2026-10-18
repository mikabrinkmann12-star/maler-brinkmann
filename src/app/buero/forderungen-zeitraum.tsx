"use client";

import { ChevronDownIcon } from "lucide-react";
import { useUrlFilter } from "@/components/listen/url-filter";
import { PopoverClose, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FORDERUNGS_STANDARD, FORDERUNGS_ZEITRAEUME, type ForderungsZeitraum } from "@/lib/dashboard";

/** Auswahl „Letzte 90 Tage / Aktueller Monat / …“ oben rechts im Kasten „Offene Forderungen“. Die Wahl steht in der Adresse (?forderungen=…). */
export function ForderungenZeitraum({ aktuell }: { aktuell: ForderungsZeitraum }) {
  const { setzen } = useUrlFilter();
  const text = FORDERUNGS_ZEITRAEUME.find(([id]) => id === aktuell)?.[1];
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-7 items-center gap-1 rounded-md border bg-white px-2 text-xs hover:bg-muted data-popup-open:bg-muted" aria-label="Zeitraum wählen">
        {text}
        <ChevronDownIcon className="size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <ul>
          {FORDERUNGS_ZEITRAEUME.map(([id, name]) => (
            <li key={id}>
              <PopoverClose
                render={<button type="button" />}
                onClick={() => setzen({ forderungen: id === FORDERUNGS_STANDARD ? null : id })}
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
              >
                {name}
              </PopoverClose>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
