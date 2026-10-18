"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import { StatusPille } from "@/components/status-pille";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ANNAHME_FARBEN, ANNAHME_NAMEN, type Annahme } from "@/lib/angebot-liste";
import { angebotAnnahmeSetzen } from "./actions";

/** Annahmestatus eines Angebots als Pille mit Pfeil: ein Tipp öffnet die Liste, die Auswahl gilt sofort (wie in Plancraft). */
export function AnnahmeWahl({ angebotId, aktuell }: { angebotId: string; aktuell: Annahme }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [laeuft, starte] = useTransition();

  function waehlen(neu: Annahme) {
    setOffen(false);
    if (neu === aktuell) return;
    starte(async () => {
      const r = await angebotAnnahmeSetzen(angebotId, neu);
      if (r.fehler) toast.error(r.fehler);
      else router.refresh();
    });
  }

  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverTrigger disabled={laeuft} aria-label="Annahmestatus ändern" className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60">
        <StatusPille name={ANNAHME_NAMEN[aktuell]} farbe={ANNAHME_FARBEN[aktuell]} className="pr-1.5" />
        <ChevronDownIcon className="-ml-1.5 size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1">
        <ul>
          {(Object.keys(ANNAHME_NAMEN) as Annahme[]).map((a) => (
            <li key={a}>
              <button type="button" onClick={() => waehlen(a)} className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-muted">
                <StatusPille name={ANNAHME_NAMEN[a]} farbe={ANNAHME_FARBEN[a]} />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
