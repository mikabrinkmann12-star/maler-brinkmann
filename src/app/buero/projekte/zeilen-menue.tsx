"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, EllipsisVerticalIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { projektArchivieren } from "../../(mitarbeiter)/baustellen/actions";

/** Drei-Punkte-Menü einer Projektzeile: Bearbeiten, Archivieren (nichts wird gelöscht). */
export function ZeilenMenue({ projektId, archiviert }: { projektId: string; archiviert: boolean }) {
  const router = useRouter();
  const [, starte] = useTransition();

  function umschalten() {
    starte(async () => {
      const r = await projektArchivieren(projektId, !archiviert);
      if (r.fehler) toast.error(r.fehler);
      else {
        toast.success(archiviert ? "Projekt wieder aktiv" : "Projekt archiviert");
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label="Weitere Aktionen"
      >
        <EllipsisVerticalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem render={<Link href={`/buero/projekte/${projektId}/bearbeiten`} />}><PencilIcon /> Bearbeiten</DropdownMenuItem>
        <DropdownMenuItem onClick={umschalten}>
          {archiviert ? <ArchiveRestoreIcon /> : <ArchiveIcon />} {archiviert ? "Wieder aktivieren" : "Archivieren"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
