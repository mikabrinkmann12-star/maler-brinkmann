"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ContainerIcon, LockIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CONTAINER_ARTEN, CONTAINER_NAMEN, restText, sperreBis, type ContainerMeldung } from "@/lib/container";
import { heuteIso } from "@/lib/datum";
import { formatDatum } from "@/lib/format";
import { containerMelden } from "@/app/(mitarbeiter)/container/actions";

/** Zwei Knöpfe „Papiercontainer“ / „Restmüllcontainer“. Nach einer Meldung ist genau diese Art für alle 7 Tage gesperrt. */
export function ContainerKarte({ meldungen }: { meldungen: ContainerMeldung[] }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();

  function melden(art: (typeof CONTAINER_ARTEN)[number]) {
    if (!window.confirm(`${CONTAINER_NAMEN[art]} melden? Danach ist dieser Container für alle 7 Tage gesperrt und das Büro bekommt Bescheid.`)) return;
    starte(async () => {
      try {
        const r = await containerMelden(art);
        if (r.fehler) toast.error(r.fehler);
        else toast.success(`${CONTAINER_NAMEN[art]} gemeldet. Das Büro bekommt Bescheid.`);
        router.refresh();
      } catch {
        toast.error("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><ContainerIcon className="size-5" /> Container</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {CONTAINER_ARTEN.map((art) => {
          const bis = sperreBis(meldungen, art);
          const letzte = meldungen.filter((m) => m.art === art && !m.freigegeben)[0];
          return (
            <div key={art} className="flex flex-col gap-2">
              <Button type="button" size="touch" variant={bis ? "outline" : "default"} disabled={laeuft || bis !== null} onClick={() => melden(art)} className="w-full">
                {bis ? <LockIcon /> : <ContainerIcon />} {CONTAINER_NAMEN[art]} {bis ? "gemeldet" : "melden"}
              </Button>
              {bis && letzte && (
                <p className="text-sm text-muted-foreground">
                  {letzte.wer} hat ihn am {formatDatum(heuteIso(new Date(letzte.zeit)))} gemeldet. Wieder möglich am {formatDatum(heuteIso(bis))} ({restText(bis)}).
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
