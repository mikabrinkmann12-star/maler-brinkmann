"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestoreIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { kontaktArchivieren } from "./actions";

/** Roter Papierkorb am Ende der Kontaktzeile (wie in Plancraft). Archiviert nur, gelöscht wird nie; im Archiv stellt er wieder her. */
export function ZeilenPapierkorb({ id, archiviert }: { id: string; archiviert: boolean }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();

  function umschalten() {
    if (!archiviert && !window.confirm("Diesen Kontakt archivieren? Er verschwindet aus der Liste, nichts wird gelöscht.")) return;
    starte(async () => {
      const r = await kontaktArchivieren(id, !archiviert);
      if (r.fehler) toast.error(r.fehler);
      else {
        toast.success(archiviert ? "Kontakt wiederhergestellt." : "Kontakt archiviert.");
        router.refresh();
      }
    });
  }

  const Icon = archiviert ? ArchiveRestoreIcon : Trash2Icon;
  return (
    <button
      type="button"
      onClick={umschalten}
      disabled={laeuft}
      aria-label={archiviert ? "Kontakt wiederherstellen" : "Kontakt archivieren"}
      title={archiviert ? "Wiederherstellen" : "Archivieren"}
      className={`flex size-7 items-center justify-center rounded-md hover:bg-muted ${archiviert ? "text-muted-foreground hover:text-foreground" : "text-destructive"}`}
    >
      <Icon className="size-4" />
    </button>
  );
}
