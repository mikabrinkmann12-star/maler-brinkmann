"use client";

import { useTransition } from "react";
import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { kontaktArchivieren } from "../actions";

export function ArchivierenKnopf({ id, archiviert }: { id: string; archiviert: boolean }) {
  const [laeuft, starte] = useTransition();

  function umschalten() {
    if (!archiviert && !window.confirm("Diesen Kontakt archivieren? Er verschwindet aus der Liste, nichts wird gelöscht.")) return;
    starte(async () => {
      const r = await kontaktArchivieren(id, !archiviert);
      if (r.fehler) toast.error(r.fehler);
      else toast.success(archiviert ? "Kontakt wiederhergestellt." : "Kontakt archiviert.");
    });
  }

  return (
    <Button type="button" variant="outline" size="lg" onClick={umschalten} disabled={laeuft}>
      {archiviert ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
      {archiviert ? "Wiederherstellen" : "Archivieren"}
    </Button>
  );
}
