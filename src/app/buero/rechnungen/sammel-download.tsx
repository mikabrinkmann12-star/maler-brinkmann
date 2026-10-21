"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Download-Knopf oben rechts wie in Plancraft: „N Rechnungen herunterladen“ mit den angewendeten Filtern.
 * Geladen werden die Dateien der Buchhaltung als ZIP; die Filter gehen als Adresse an `/buero/rechnungen/export`.
 */
export function SammelDownload({
  anzahl,
  mitDatei,
  max,
  filterZeilen,
}: {
  /** Rechnungen, die zu den Filtern passen */
  anzahl: number;
  /** davon mit Datei der Buchhaltung */
  mitDatei: number;
  max: number;
  filterZeilen: { name: string; wert: string }[];
}) {
  const [offen, setOffen] = useState(false);
  const suche = useSearchParams().toString();
  const zuViele = mitDatei > max;
  const moeglich = mitDatei > 0 && !zuViele;

  return (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogTrigger
        aria-label="Rechnungen herunterladen"
        title="Rechnungen herunterladen"
        className="flex size-8 items-center justify-center rounded-md border bg-white hover:bg-muted"
      >
        <DownloadIcon className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{anzahl} {anzahl === 1 ? "Rechnung" : "Rechnungen"} herunterladen</DialogTitle>
          <DialogDescription>Die Dateien kommen von der Buchhaltung und werden als ZIP geladen.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold">Angewendete Filter</p>
            {filterZeilen.length ? (
              <ul className="mt-1 flex flex-col gap-0.5">
                {filterZeilen.map((z) => <li key={z.name}><span className="font-medium">{z.name}:</span> {z.wert}</li>)}
              </ul>
            ) : <p className="mt-1 text-muted-foreground">Keine</p>}
          </div>
          <p>
            {mitDatei} von {anzahl} {anzahl === 1 ? "Rechnung hat" : "Rechnungen haben"} eine Datei.
            {mitDatei < anzahl && " Entwürfe und noch nicht abgeglichene Rechnungen haben keine."}
          </p>
          {zuViele && <p className="text-destructive">Höchstens {max} Dateien gehen auf einmal. Grenze den Zeitraum oder die Filter ein.</p>}
          {mitDatei === 0 && <p className="text-muted-foreground">Zu diesen Filtern gibt es keine Datei zum Herunterladen.</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOffen(false)}>Abbrechen</Button>
          {moeglich ? (
            <a href={`/buero/rechnungen/export${suche ? `?${suche}` : ""}`} onClick={() => setOffen(false)} className={buttonVariants()}>Herunterladen</a>
          ) : (
            <Button type="button" disabled>Herunterladen</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
