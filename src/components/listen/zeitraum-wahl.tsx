"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { PopoverClose } from "@/components/ui/popover";
import { formatMonat } from "@/lib/format";
import {
  ZEITRAUM_VORGABEN,
  monatVerschieben,
  monatsRaster,
  vorgabeBereich,
  vorgabeFuer,
  type Zeitraum,
} from "@/lib/zeitraum";

const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function Monat({ jahr, monat, von, bis, heute, onTag }: { jahr: number; monat: number; von: string | null; bis: string | null; heute: string; onTag: (t: string) => void }) {
  return (
    <div className="w-[16.5rem]">
      <p className="mb-1.5 text-center text-[13px] font-medium">{formatMonat(`${jahr}-${String(monat).padStart(2, "0")}`).replace(/^./, (c) => c.toUpperCase())}</p>
      <div className="grid grid-cols-[1.5rem_repeat(7,1fr)] gap-y-0.5 text-center text-[12px]">
        <span />
        {WOCHENTAGE.map((w) => <span key={w} className="text-muted-foreground">{w}</span>)}
        {monatsRaster(jahr, monat).map((w) => (
          <div key={w.kw} className="contents">
            <span className="self-center text-[10px] text-muted-foreground">{w.kw}</span>
            {w.tage.map((t, i) => {
              if (!t) return <span key={i} />;
              const lo = von && bis ? (von < bis ? von : bis) : von;
              const hi = von && bis ? (von < bis ? bis : von) : von;
              const inBereich = lo && hi && t >= lo && t <= hi;
              const rand = t === lo || t === hi;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTag(t)}
                  className={cn(
                    "h-7 text-[12px] transition-colors hover:bg-muted",
                    inBereich && "bg-primary/12",
                    rand && "bg-primary font-medium text-primary-foreground hover:bg-primary",
                    !rand && t === heute && "font-semibold text-primary",
                  )}
                >
                  {Number(t.slice(8))}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Zeitraum wählen wie in Plancraft: links Vorgaben (Heute, Letzte 30 Tage, Dieser Monat …), rechts zwei Monatskalender mit
 * Kalenderwochen; zwei Tage antippen = Bereich. „Speichern“ übernimmt, „Abbrechen“ schließt.
 */
export function ZeitraumWahl({ wert, heute, onSpeichern }: { wert: Zeitraum | null; heute: string; onSpeichern: (z: Zeitraum | null) => void }) {
  const start = wert?.von ?? heute;
  const [anzeige, setAnzeige] = useState({ jahr: Number(start.slice(0, 4)), monat: Number(start.slice(5, 7)) });
  const [von, setVon] = useState<string | null>(wert?.von ?? null);
  const [bis, setBis] = useState<string | null>(wert?.bis ?? null);
  const naechster = monatVerschieben(anzeige.jahr, anzeige.monat, 1);
  const vorgabe = von && bis ? vorgabeFuer({ von, bis }, heute) : null;

  function tag(t: string) {
    if (!von || (von && bis)) {
      setVon(t);
      setBis(null);
    } else if (t < von) {
      setBis(von);
      setVon(t);
    } else {
      setBis(t);
    }
  }

  function waehlen(name: (typeof ZEITRAUM_VORGABEN)[number][0]) {
    const b = vorgabeBereich(name, heute);
    setVon(b.von);
    setBis(b.bis);
    setAnzeige({ jahr: Number(b.von.slice(0, 4)), monat: Number(b.von.slice(5, 7)) });
  }

  return (
    <div className="flex">
      <ul className="flex w-36 shrink-0 flex-col gap-0.5 border-r p-2">
        {ZEITRAUM_VORGABEN.map(([name, text]) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => waehlen(name)}
              className={cn("w-full rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted", vorgabe === name && "bg-muted font-medium")}
            >
              {text}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex gap-6">
          <div className="flex flex-col">
            <button type="button" aria-label="Voriger Monat" onClick={() => setAnzeige(monatVerschieben(anzeige.jahr, anzeige.monat, -1))} className="mb-[-1.4rem] flex size-6 items-center justify-center rounded hover:bg-muted">
              <ChevronLeftIcon className="size-4" />
            </button>
            <Monat {...anzeige} von={von} bis={bis} heute={heute} onTag={tag} />
          </div>
          <div className="flex flex-col items-end">
            <button type="button" aria-label="Nächster Monat" onClick={() => setAnzeige(monatVerschieben(anzeige.jahr, anzeige.monat, 1))} className="mb-[-1.4rem] flex size-6 items-center justify-center rounded hover:bg-muted">
              <ChevronRightIcon className="size-4" />
            </button>
            <Monat jahr={naechster.jahr} monat={naechster.monat} von={von} bis={bis} heute={heute} onTag={tag} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-3">
          {wert && (
            <Button type="button" variant="ghost" size="sm" className="mr-auto" onClick={() => onSpeichern(null)}>
              Zurücksetzen
            </Button>
          )}
          <PopoverClose render={<Button type="button" variant="outline" size="sm" />}>Abbrechen</PopoverClose>
          <PopoverClose
            render={<Button type="button" size="sm" disabled={!von} />}
            onClick={() => von && onSpeichern({ von, bis: bis ?? von })}
          >
            Speichern
          </PopoverClose>
        </div>
      </div>
    </div>
  );
}
