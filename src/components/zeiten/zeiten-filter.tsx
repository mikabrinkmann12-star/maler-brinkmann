"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarIcon, DownloadIcon, FolderIcon, SearchIcon, TagIcon, UserIcon } from "lucide-react";
import { FilterKnopf } from "@/components/listen/filter-knopf";
import { MehrfachListe, type ListenOption } from "@/components/listen/mehrfach-liste";
import { useUrlFilter } from "@/components/listen/url-filter";
import { ZeitraumWahl } from "@/components/listen/zeitraum-wahl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDatum } from "@/lib/format";
import { ZEITRAUM_VORGABEN, vorgabeBereich, vorgabeFuer, type Zeitraum } from "@/lib/zeitraum";

/** Suchzeile und Filterknöpfe der Zeiten (Zeitraum, Mitarbeiter, Projekte, Art) mit „Filter zurücksetzen“ und CSV-Download. */
export function ZeitenFilter({
  q,
  zeitraum,
  personIds,
  projektIds,
  arten,
  personen,
  projekte,
  artOptionen,
  heute,
  exportAdresse,
}: {
  q: string;
  zeitraum: Zeitraum;
  personIds: string[];
  projektIds: string[];
  arten: string[];
  personen: ListenOption[];
  projekte: ListenOption[];
  artOptionen: ListenOption[];
  heute: string;
  /** Adressen der CSV-Downloads mit den aktuellen Filtern */
  exportAdresse: { summen: string; einzeln: string };
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

  const standard = vorgabeBereich("dieser_monat", heute);
  const istStandard = zeitraum.von === standard.von && zeitraum.bis === standard.bis;
  const vorgabe = vorgabeFuer(zeitraum, heute);
  const zeitraumText = istStandard
    ? "Aktueller Monat"
    : (vorgabe ? ZEITRAUM_VORGABEN.find(([n]) => n === vorgabe)?.[1] : null) ?? `${formatDatum(zeitraum.von)} – ${formatDatum(zeitraum.bis)}`;
  const hatFilter = Boolean(q || personIds.length || projektIds.length || arten.length || !istStandard);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative w-72 max-w-full">
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
          placeholder="Suche nach Name, Projekt, Beschreibung…"
          aria-label="Suchen"
          className="h-8 w-full rounded-md border border-border bg-white pr-8 pl-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <SearchIcon className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </label>

      <FilterKnopf icon={<CalendarIcon />} label={zeitraumText} aktiv breite="w-auto">
        <ZeitraumWahl wert={zeitraum} heute={heute} onSpeichern={(z) => setzen({ von: z?.von ?? null, bis: z?.bis ?? null })} />
      </FilterKnopf>
      <FilterKnopf icon={<UserIcon />} label="Mitarbeiter" aktiv={personIds.length > 0} anzahl={personIds.length} breite="w-64">
        <MehrfachListe optionen={personen} gewaehlt={personIds} onAendern={(ids) => setzen({ person: ids.join(",") || null })} />
      </FilterKnopf>
      <FilterKnopf icon={<FolderIcon />} label="Projekte" aktiv={projektIds.length > 0} anzahl={projektIds.length} breite="w-80">
        <MehrfachListe optionen={projekte} gewaehlt={projektIds} onAendern={(ids) => setzen({ projekt: ids.join(",") || null })} />
      </FilterKnopf>
      <FilterKnopf icon={<TagIcon />} label="Art" aktiv={arten.length > 0} anzahl={arten.length} breite="w-64">
        <MehrfachListe suche={false} optionen={artOptionen} gewaehlt={arten} onAendern={(ids) => setzen({ art: ids.join(",") || null })} />
      </FilterKnopf>

      {hatFilter && (
        <button
          type="button"
          onClick={() => {
            setText("");
            zuletzt.current = "";
            setzen({ q: null, von: null, bis: null, person: null, projekt: null, art: null });
          }}
          className="flex h-8 items-center gap-1 px-1 text-[13px] font-medium text-destructive hover:underline"
        >
          ↺ Filter zurücksetzen
        </button>
      )}

      <Popover>
        <PopoverTrigger className="ml-auto flex size-8 items-center justify-center rounded-md border bg-white text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Als CSV herunterladen" title="Herunterladen">
          <DownloadIcon className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1">
          <a href={exportAdresse.summen} download className="block rounded-md px-2 py-1.5 text-[13px] hover:bg-muted">Summen je Mitarbeiter (CSV)</a>
          <a href={exportAdresse.einzeln} download className="block rounded-md px-2 py-1.5 text-[13px] hover:bg-muted">Alle Einträge (CSV)</a>
        </PopoverContent>
      </Popover>
    </div>
  );
}
