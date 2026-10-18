"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, EllipsisVerticalIcon, FolderInputIcon, PencilIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatBetrag, formatZahl } from "@/lib/format";
import { bearbeitetText } from "@/lib/listen-anzeige";
import type { KatalogArt } from "@/lib/katalog";
import { eintragArchivieren, eintraegeArchivierenMehrere, eintraegeVerschieben } from "./actions";

export type TabellenZeile = {
  id: string;
  name: string;
  nummer: string;
  einheit: string;
  preis: number;
  zuschlag: number;
  vk: number;
  /** Zweite Zeile unter dem Namen (Lieferant, Ordner) */
  info: string;
  aktualisiert: string;
};

/**
 * Tabelle der Materialien bzw. Leistungen wie in Plancraft: Auswahlkästchen, bei Auswahl eine Leiste „N ausgewählt“ mit
 * Verschieben und Archivieren (nichts wird gelöscht), Spalten Beschreibung, Einheit, Kosten, Zuschlag, VK, Bearbeitet, Menü.
 */
export function KatalogTabelle({
  art,
  zeilen,
  ordner,
  archiv,
  gesamt,
  leerText,
}: {
  art: KatalogArt;
  zeilen: TabellenZeile[];
  /** Ordner zum Verschieben (Pfadtext) */
  ordner: { id: string; text: string }[];
  archiv: boolean;
  gesamt: number;
  leerText: string;
}) {
  const router = useRouter();
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [laeuft, starte] = useTransition();
  const istMaterial = art === "material";
  const alleGewaehlt = zeilen.length > 0 && zeilen.every((z) => gewaehlt.includes(z.id));
  // Nur Einträge behalten, die es noch in der Liste gibt (nach dem Verschieben oder einer neuen Suche)
  const aktiv = gewaehlt.filter((id) => zeilen.some((z) => z.id === id));

  function umschalten(id: string) {
    setGewaehlt((alt) => (alt.includes(id) ? alt.filter((x) => x !== id) : [...alt, id]));
  }

  function nachAktion(text: string) {
    toast.success(text);
    setGewaehlt([]);
    router.refresh();
  }

  function verschieben(folderId: string, name: string) {
    starte(async () => {
      const r = await eintraegeVerschieben(art, aktiv, folderId);
      if (r.fehler) toast.error(r.fehler);
      else nachAktion(`${r.anzahl} ${r.anzahl === 1 ? "Eintrag" : "Einträge"} nach „${name}“ verschoben.`);
    });
  }

  function archivieren() {
    if (!window.confirm(`${aktiv.length} ${aktiv.length === 1 ? "Eintrag" : "Einträge"} archivieren? Nichts wird gelöscht, im Archiv lassen sie sich wiederherstellen.`)) return;
    starte(async () => {
      const r = await eintraegeArchivierenMehrere(art, aktiv);
      if (r.fehler) toast.error(r.fehler);
      else nachAktion(`${r.anzahl} ${r.anzahl === 1 ? "Eintrag" : "Einträge"} archiviert.`);
    });
  }

  function einzeln(id: string, archivieren: boolean) {
    starte(async () => {
      const r = await eintragArchivieren(art, id, archivieren);
      if (r.fehler) toast.error(r.fehler);
      else nachAktion(archivieren ? "Archiviert." : "Wiederhergestellt.");
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      {aktiv.length > 0 && (
        <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2 text-[13px]">
          <span className="font-medium">{aktiv.length} ausgewählt</span>
          <Popover>
            <PopoverTrigger disabled={laeuft} className="ml-2 inline-flex h-7 items-center gap-1.5 rounded-md border bg-white px-2 hover:bg-muted">
              <FolderInputIcon className="size-3.5" /> Verschieben
            </PopoverTrigger>
            <PopoverContent align="start" className="max-h-72 w-72 overflow-y-auto p-1">
              <ul>
                <li>
                  <PopoverClose render={<button type="button" />} onClick={() => verschieben("", "Ohne Ordner")} className="flex w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted">Ohne Ordner</PopoverClose>
                </li>
                {ordner.map((o) => (
                  <li key={o.id}>
                    <PopoverClose render={<button type="button" />} onClick={() => verschieben(o.id, o.text.split(" › ").pop() ?? o.text)} className="flex w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted">{o.text}</PopoverClose>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
          {!archiv && (
            <button type="button" onClick={archivieren} disabled={laeuft} className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-white px-2 text-destructive hover:bg-muted">
              <ArchiveIcon className="size-3.5" /> Archivieren
            </button>
          )}
          <button type="button" onClick={() => setGewaehlt([])} aria-label="Auswahl aufheben" className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white hover:text-foreground">
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left text-xs font-semibold">
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" aria-label="Alle auswählen" checked={alleGewaehlt} onChange={() => setGewaehlt(alleGewaehlt ? [] : zeilen.map((z) => z.id))} className="size-3.5 accent-[oklch(0.6_0.135_153)]" />
              </th>
              <th className="px-3 py-2.5">Beschreibung</th>
              <th className="hidden px-3 py-2.5 sm:table-cell">Einheit</th>
              <th className="px-3 py-2.5 text-right">{istMaterial ? "EK €" : "Kosten €"}</th>
              <th className="hidden px-3 py-2.5 text-right md:table-cell">Zuschlag %</th>
              <th className="px-3 py-2.5 text-right">VK €</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Bearbeitet</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {zeilen.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">{leerText}</td></tr>}
            {zeilen.map((z) => (
              <tr key={z.id} className={cn("relative border-b last:border-b-0 hover:bg-muted/40", aktiv.includes(z.id) && "bg-muted/50")}>
                <td className="relative z-10 px-3 py-2.5">
                  <input type="checkbox" aria-label={`${z.name} auswählen`} checked={aktiv.includes(z.id)} onChange={() => umschalten(z.id)} className="size-3.5 accent-[oklch(0.6_0.135_153)]" />
                </td>
                <td className="max-w-96 px-3 py-2.5">
                  <Link href={`/buero/katalog/${art}/${z.id}`} className="block truncate font-medium after:absolute after:inset-0 after:content-['']">{z.name}</Link>
                  {(z.nummer || z.info) && <span className="block truncate text-xs text-muted-foreground">{[z.nummer, z.info].filter(Boolean).join(" · ")}</span>}
                </td>
                <td className="hidden px-3 py-2.5 whitespace-nowrap sm:table-cell">{z.einheit}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatBetrag(z.preis)}</td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{formatZahl(z.zuschlag)}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatBetrag(z.vk)}</td>
                <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted-foreground lg:table-cell">{bearbeitetText(z.aktualisiert)}</td>
                <td className="relative z-10 px-2 py-2.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50" aria-label="Weitere Aktionen">
                      <EllipsisVerticalIcon className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem render={<Link href={`/buero/katalog/${art}/${z.id}`} />}><PencilIcon /> Bearbeiten</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => einzeln(z.id, !archiv)}>
                        {archiv ? <ArchiveRestoreIcon /> : <ArchiveIcon />} {archiv ? "Wiederherstellen" : "Archivieren"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t px-3 py-2 text-xs text-muted-foreground">
        {gesamt} {istMaterial ? (gesamt === 1 ? "Material" : "Materialien") : gesamt === 1 ? "Leistung" : "Leistungen"}
        {gesamt > zeilen.length && ` · die ersten ${zeilen.length} werden gezeigt, bitte genauer suchen`}
      </div>
    </div>
  );
}
