"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, CopyIcon, EllipsisVerticalIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { angebotArchivieren, angebotKopieren } from "./actions";

/** Drei-Punkte-Menü einer Angebotszeile: Öffnen, Kopieren, Archivieren (nichts wird gelöscht). */
export function AngebotZeilenMenue({ angebotId, archiviert }: { angebotId: string; archiviert: boolean }) {
  const router = useRouter();
  const [, starte] = useTransition();

  function kopieren() {
    starte(async () => {
      const r = await angebotKopieren(angebotId);
      if (r.fehler || !r.id) toast.error(r.fehler ?? "Kopieren hat nicht geklappt.");
      else {
        toast.success("Kopie als Entwurf angelegt");
        router.push(`/buero/angebote/${r.id}`);
      }
    });
  }

  function umschalten() {
    starte(async () => {
      const r = await angebotArchivieren(angebotId, !archiviert);
      if (r.fehler) toast.error(r.fehler);
      else {
        toast.success(archiviert ? "Angebot wieder aktiv" : "Angebot archiviert");
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" aria-label="Weitere Aktionen">
        <EllipsisVerticalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem render={<Link href={`/buero/angebote/${angebotId}`} />}><PencilIcon /> Öffnen</DropdownMenuItem>
        <DropdownMenuItem onClick={kopieren}><CopyIcon /> Kopieren</DropdownMenuItem>
        <DropdownMenuItem onClick={umschalten}>
          {archiviert ? <ArchiveRestoreIcon /> : <ArchiveIcon />} {archiviert ? "Wieder aktivieren" : "Archivieren"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
