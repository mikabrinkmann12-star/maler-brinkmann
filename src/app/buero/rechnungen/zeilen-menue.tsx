"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArchiveIcon, ArchiveRestoreIcon, DownloadIcon, EllipsisVerticalIcon, EyeIcon, FileCodeIcon, FolderIcon, PrinterIcon } from "lucide-react";
import { RechnungPdfFenster } from "@/components/rechnung-pdf";
import { rechnungArchivieren, rechnungWiederherstellen } from "./actions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Drei-Punkte-Menü einer Rechnungszeile wie in Plancraft: PDF ansehen, Projekt öffnen, PDF herunterladen, XRechnung herunterladen, Drucken.
 * Ohne gespeicherte Datei sind die Datei-Einträge ausgegraut.
 */
export function RechnungZeilenMenue({
  rechnungId,
  titel,
  projektId,
  hatPdf,
  hatXml,
  istEntwurf,
  archiviert,
}: {
  rechnungId: string;
  titel: string;
  projektId: string;
  hatPdf: boolean;
  hatXml: boolean;
  /** Nur Entwürfe lassen sich archivieren; fertige Rechnungen bleiben (GoBD) */
  istEntwurf: boolean;
  archiviert: boolean;
}) {
  const router = useRouter();
  const [, starte] = useTransition();

  function archivUmschalten() {
    starte(async () => {
      const r = await (archiviert ? rechnungWiederherstellen(rechnungId) : rechnungArchivieren(rechnungId));
      if (r.fehler) toast.error(r.fehler);
      else {
        toast.success(archiviert ? "Rechnung wiederhergestellt" : "Entwurf archiviert");
        router.refresh();
      }
    });
  }

  const [fenster, setFenster] = useState<"ansehen" | "drucken" | null>(null);
  const datei = `/buero/rechnungen/${rechnungId}/pdf?download=1`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="relative z-10 flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" aria-label={`Weitere Aktionen: ${titel}`}>
          <EllipsisVerticalIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem disabled={!hatPdf} onClick={() => setFenster("ansehen")}><EyeIcon /> PDF ansehen</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/buero/projekte/${projektId}`} />}><FolderIcon /> Projekt öffnen</DropdownMenuItem>
          <DropdownMenuItem disabled={!hatPdf} render={hatPdf ? <a href={datei} /> : undefined}><DownloadIcon /> PDF herunterladen</DropdownMenuItem>
          <DropdownMenuItem disabled={!hatXml} render={hatXml ? <a href={datei} /> : undefined}><FileCodeIcon /> XRechnung herunterladen</DropdownMenuItem>
          <DropdownMenuItem disabled={!hatPdf} onClick={() => setFenster("drucken")}><PrinterIcon /> Drucken</DropdownMenuItem>
          {(istEntwurf || archiviert) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={archivUmschalten}>{archiviert ? <ArchiveRestoreIcon /> : <ArchiveIcon />} {archiviert ? "Wiederherstellen" : "Entwurf archivieren"}</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {fenster && <RechnungPdfFenster rechnungId={rechnungId} titel={titel} autoDrucken={fenster === "drucken"} onClose={() => setFenster(null)} />}
    </>
  );
}
