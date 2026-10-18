"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import { StatusPille } from "@/components/status-pille";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { projektStatusAendern } from "./actions";

type Status = { id: string; name: string; farbe: string };

/** Status eines Projekts: Pille mit Pfeil; antippen öffnet die Liste, ein Tipp ändert den Status sofort (wie in Plancraft). */
export function StatusWahl({ projektId, aktuell, alle }: { projektId: string; aktuell: Status | null; alle: Status[] }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [laeuft, starte] = useTransition();

  function waehlen(statusId: string) {
    setOffen(false);
    starte(async () => {
      const r = await projektStatusAendern(projektId, statusId);
      if (r.fehler) toast.error(r.fehler);
      else router.refresh();
    });
  }

  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverTrigger
        disabled={laeuft}
        className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
        aria-label="Status ändern"
      >
        {aktuell ? <StatusPille name={aktuell.name} farbe={aktuell.farbe} className="pr-1.5" /> : <StatusPille name="Kein Status" farbe="#9ca3af" className="pr-1.5" />}
        <ChevronDownIcon className="-ml-1.5 size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1">
        <ul className="flex flex-col">
          {alle.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => waehlen(s.id)} className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-muted">
                <StatusPille name={s.name} farbe={s.farbe} />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
