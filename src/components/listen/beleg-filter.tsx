"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArchiveIcon, CalendarIcon, FolderIcon, MonitorIcon, SearchIcon, TagIcon } from "lucide-react";
import { cn } from "cn";
import { FilterKnopf } from "@/components/listen/filter-knopf";
import { MehrfachListe, type ListenOption } from "@/components/listen/mehrfach-liste";
import { useUrlFilter } from "@/components/listen/url-filter";
import { ZeitraumWahl } from "@/components/listen/zeitraum-wahl";
import { PopoverClose } from "@/components/ui/popover";
import { formatDatum } from "@/lib/format";
import { ZEITRAUM_VORGABEN, vorgabeFuer, type Zeitraum } from "@/lib/zeitraum";

/**
 * Filterzeile der Angebots- und Rechnungsliste (wie in Plancraft): Suche, Zeitraum, Status (Mehrfachauswahl, auch in Gruppen),
 * Projekt, optional „Aktive Projekte“, Aktiv/Archiv und rechts der Umschalter „Brutto € / Netto €“. Alles steht in der Adresse.
 * `zusatz` ist Platz für weitere Knöpfe (z. B. Download).
 */
export function BelegFilter({
  q,
  platzhalter,
  zeitraum,
  heute,
  status,
  statusOptionen,
  projektIds,
  projekte,
  netto,
  archiv,
  aktiveProjekte,
  zusatz,
}: {
  q: string;
  platzhalter: string;
  zeitraum: Zeitraum | null;
  heute: string;
  status: string[];
  statusOptionen: ListenOption[];
  projektIds: string[];
  projekte: ListenOption[];
  netto: boolean;
  archiv: boolean;
  /** undefined = Schalter „Aktive Projekte“ nicht anzeigen */
  aktiveProjekte?: boolean;
  zusatz?: ReactNode;
}) {
  const { setzen } = useUrlFilter();
  const [text, setText] = useState(q);
  const zuletzt = useRef(q);

  useEffect(() => {
    if (text === zuletzt.current) return;
    const t = window.setTimeout(() => {
      zuletzt.current = text;
      setzen({ q: text.trim() || null });
    }, 350);
    return () => window.clearTimeout(t);
  }, [text, setzen]);

  const vorgabe = zeitraum ? vorgabeFuer(zeitraum, heute) : null;
  const zeitraumText = zeitraum
    ? (vorgabe ? ZEITRAUM_VORGABEN.find(([n]) => n === vorgabe)?.[1] : null) ?? `${formatDatum(zeitraum.von)} – ${formatDatum(zeitraum.bis)}`
    : "Zeitraum";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative w-60">
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              zuletzt.current = text;
              setzen({ q: text.trim() || null });
            }
          }}
          placeholder={platzhalter}
          aria-label="Suchen"
          className="h-8 w-full rounded-md border border-border bg-white pr-8 pl-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <SearchIcon className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </label>

      <FilterKnopf icon={<MonitorIcon />} label={archiv ? "Archiv" : "Aktiv"} aktiv breite="w-40">
        <ul className="p-1">
          {([["", "Aktiv", MonitorIcon], ["1", "Archiv", ArchiveIcon]] as const).map(([wert, name, Icon]) => (
            <li key={wert}>
              <PopoverClose render={<button type="button" />} onClick={() => setzen({ archiv: wert || null })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted">
                <Icon className="size-3.5 text-muted-foreground" /> {name}
              </PopoverClose>
            </li>
          ))}
        </ul>
      </FilterKnopf>

      <FilterKnopf icon={<CalendarIcon />} label={zeitraumText} aktiv={Boolean(zeitraum)} breite="w-auto">
        <ZeitraumWahl wert={zeitraum} heute={heute} onSpeichern={(z) => setzen({ von: z?.von ?? null, bis: z?.bis ?? null })} />
      </FilterKnopf>

      <FilterKnopf icon={<TagIcon />} label="Status" aktiv={status.length > 0} anzahl={status.length} breite="w-60">
        <MehrfachListe suche={false} optionen={statusOptionen} gewaehlt={status} onAendern={(ids) => setzen({ status: ids.join(",") || null })} />
      </FilterKnopf>

      <FilterKnopf icon={<FolderIcon />} label="Projekt" aktiv={projektIds.length > 0} anzahl={projektIds.length} breite="w-80">
        <MehrfachListe optionen={projekte} gewaehlt={projektIds} onAendern={(ids) => setzen({ projekt: ids.join(",") || null })} />
      </FilterKnopf>

      {aktiveProjekte !== undefined && (
        <button
          type="button"
          aria-pressed={aktiveProjekte}
          onClick={() => setzen({ aktiv: aktiveProjekte ? null : "1" })}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-md border bg-white px-2.5 text-[13px] hover:bg-muted",
            aktiveProjekte ? "border-foreground/80" : "border-border",
          )}
        >
          <span aria-hidden className={cn("flex size-3.5 items-center justify-center rounded-[3px] border", aktiveProjekte ? "border-primary bg-primary" : "border-input")}>
            {aktiveProjekte && <span className="size-1.5 rounded-[1px] bg-primary-foreground" />}
          </span>
          Aktive Projekte
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {zusatz}
        <div role="group" aria-label="Betrag anzeigen" className="inline-flex h-8 overflow-hidden rounded-md border bg-white text-[13px]">
          {([[false, "Brutto €"], [true, "Netto €"]] as const).map(([istNetto, name]) => (
            <button
              key={name}
              type="button"
              aria-pressed={netto === istNetto}
              onClick={() => setzen({ netto: istNetto ? "1" : null })}
              className={cn("px-2.5 transition-colors", netto === istNetto ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-muted/60")}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
