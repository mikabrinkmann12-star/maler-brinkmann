"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, SlidersHorizontalIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  LAYOUT_COOKIE,
  STANDARD_LAYOUT,
  WIDGETS,
  dialogListe,
  layoutSchreiben,
  verschieben,
  type DashboardLayout,
  type Spalte,
  type WidgetId,
} from "@/lib/dashboard-layout";

type Eintrag = { id: WidgetId; an: boolean };
type Entwurf = Record<Spalte, Eintrag[]>;

const SPALTEN: [Spalte, string][] = [["links", "Linke Spalte"], ["rechts", "Rechte Spalte"]];

function entwurfAus(layout: DashboardLayout): Entwurf {
  return { links: dialogListe("links", layout.links), rechts: dialogListe("rechts", layout.rechts) };
}

/**
 * „Anpassen“ unten rechts auf der Übersicht (wie in Plancraft: „Widget-Auswahl & Anordnung“): je Spalte Kästen ein- oder ausblenden
 * und mit den Pfeilen nach oben oder unten schieben. Die Wahl wird in einem Cookie dieses Browsers gemerkt.
 */
export function DashboardAnpassen({ layout }: { layout: DashboardLayout }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [spalte, setSpalte] = useState<Spalte>("links");
  const [entwurf, setEntwurf] = useState<Entwurf>(() => entwurfAus(layout));

  function oeffnen(neu: boolean) {
    if (neu) {
      setEntwurf(entwurfAus(layout)); // immer mit dem aktuell gespeicherten Stand beginnen
      setSpalte("links");
    }
    setOffen(neu);
  }

  function aendern(s: Spalte, fn: (liste: Eintrag[]) => Eintrag[]) {
    setEntwurf((alt) => ({ ...alt, [s]: fn(alt[s]) }));
  }

  function speichern(neu: DashboardLayout) {
    document.cookie = `${LAYOUT_COOKIE}=${layoutSchreiben(neu)}; path=/; max-age=31536000; samesite=lax`;
    setOffen(false);
    router.refresh();
  }

  const liste = entwurf[spalte];

  return (
    <Dialog open={offen} onOpenChange={oeffnen}>
      <DialogTrigger render={<Button type="button" variant="outline" className="h-8 px-3 text-[13px]" />}>
        <SlidersHorizontalIcon className="size-3.5" /> Anpassen
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Widget-Auswahl &amp; Anordnung</DialogTitle>
          <DialogDescription>Wähle, was auf deiner Übersicht steht, und schiebe die Kästen mit den Pfeilen nach oben oder unten.</DialogDescription>
        </DialogHeader>

        <div role="tablist" className="flex gap-5 border-b">
          {SPALTEN.map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={spalte === id}
              onClick={() => setSpalte(id)}
              className={cn("-mb-px border-b-2 pb-2 text-[13px]", spalte === id ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {text}
            </button>
          ))}
        </div>

        <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {liste.map((e, i) => {
            const w = WIDGETS.find((x) => x.id === e.id)!;
            return (
              <li key={e.id} className={cn("flex items-start gap-2 rounded-lg border bg-white p-2.5", !e.an && "opacity-60")}>
                <div className="flex flex-col">
                  <button type="button" aria-label={`${w.titel} nach oben`} disabled={i === 0} onClick={() => aendern(spalte, (l) => verschieben(l, i, "hoch"))} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                    <ArrowUpIcon className="size-4" />
                  </button>
                  <button type="button" aria-label={`${w.titel} nach unten`} disabled={i === liste.length - 1} onClick={() => aendern(spalte, (l) => verschieben(l, i, "runter"))} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                    <ArrowDownIcon className="size-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">{w.titel}</p>
                  <p className="text-xs text-muted-foreground">{w.beschreibung}</p>
                </div>
                <input
                  type="checkbox"
                  checked={e.an}
                  onChange={(ev) => aendern(spalte, (l) => l.map((x) => (x.id === e.id ? { ...x, an: ev.target.checked } : x)))}
                  aria-label={`${w.titel} anzeigen`}
                  className="mt-0.5 size-4 shrink-0 accent-[oklch(0.6_0.135_153)]"
                />
              </li>
            );
          })}
        </ul>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" className="h-8 px-3 text-[13px]" onClick={() => speichern(STANDARD_LAYOUT)}>Zurücksetzen</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-8 px-3 text-[13px]" onClick={() => setOffen(false)}>Abbrechen</Button>
            <Button
              type="button"
              className="h-8 px-3 text-[13px]"
              onClick={() => speichern({ links: entwurf.links.filter((e) => e.an).map((e) => e.id), rechts: entwurf.rechts.filter((e) => e.an).map((e) => e.id) })}
            >
              Speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
