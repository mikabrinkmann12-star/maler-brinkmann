"use client";

import { useTransition } from "react";
import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { projektArchivieren } from "../actions";

/** Archivieren/Wiederherstellen eines Projekts (nur Büro/Admin sehen den Knopf). */
export function ProjektArchivieren({ projektId, archiviert }: { projektId: string; archiviert: boolean }) {
  const [laeuft, starte] = useTransition();

  function umschalten() {
    if (!archiviert && !window.confirm("Dieses Projekt archivieren? Es bleibt für alle zum Nachschauen lesbar, taucht aber nicht mehr unter den aktiven Baustellen auf.")) return;
    starte(async () => {
      const r = await projektArchivieren(projektId, !archiviert);
      if (r.fehler) toast.error(r.fehler);
      else toast.success(archiviert ? "Projekt ist wieder aktiv." : "Projekt archiviert.");
    });
  }

  return (
    <Button type="button" variant="outline" size="touch" className="w-full" onClick={umschalten} disabled={laeuft}>
      {archiviert ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
      {archiviert ? "Wieder aktivieren" : "Projekt archivieren"}
    </Button>
  );
}
