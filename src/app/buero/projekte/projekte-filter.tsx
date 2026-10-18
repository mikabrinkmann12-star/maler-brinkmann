"use client";

import { useEffect, useRef, useState } from "react";
import { ArchiveIcon, CalendarIcon, MonitorIcon, SearchIcon, TagIcon, UserIcon } from "lucide-react";
import { FilterKnopf } from "@/components/listen/filter-knopf";
import { MehrfachListe, type ListenOption } from "@/components/listen/mehrfach-liste";
import { useUrlFilter } from "@/components/listen/url-filter";
import { ZeitraumWahl } from "@/components/listen/zeitraum-wahl";
import { PopoverClose } from "@/components/ui/popover";
import { StatusPille } from "@/components/status-pille";
import { ZEITRAUM_VORGABEN, vorgabeFuer, type Zeitraum } from "@/lib/zeitraum";
import { formatDatum } from "@/lib/format";

/** Suchzeile und Filterknöpfe der Projektliste (Aktiv/Archiv, Datum, Status, Mitarbeiter), alles in der Adresse gespeichert. */
export function ProjekteFilter({
  archiv,
  q,
  zeitraum,
  statusIds,
  mitarbeiterIds,
  status,
  personen,
  heute,
}: {
  archiv: boolean;
  q: string;
  zeitraum: Zeitraum | null;
  statusIds: string[];
  mitarbeiterIds: string[];
  status: { id: string; name: string; farbe: string }[];
  personen: { id: string; name: string }[];
  heute: string;
}) {
  const { setzen } = useUrlFilter();
  const [text, setText] = useState(q);
  const zuletzt = useRef(q);

  // Suche: kurz nach dem Tippen übernehmen
  useEffect(() => {
    if (text === zuletzt.current) return;
    const t = window.setTimeout(() => {
      zuletzt.current = text;
      setzen({ q: text.trim() || null });
    }, 350);
    return () => window.clearTimeout(t);
  }, [text, setzen]);

  const statusOptionen: ListenOption[] = status.map((s) => ({ id: s.id, text: s.name, anzeige: <StatusPille name={s.name} farbe={s.farbe} /> }));
  const personenOptionen: ListenOption[] = personen.map((p) => ({ id: p.id, text: p.name }));
  const vorgabe = zeitraum ? vorgabeFuer(zeitraum, heute) : null;
  const datumText = zeitraum
    ? (vorgabe ? ZEITRAUM_VORGABEN.find(([n]) => n === vorgabe)?.[1] : null) ?? `${formatDatum(zeitraum.von)} – ${formatDatum(zeitraum.bis)}`
    : "Datum";

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
          placeholder="Suche nach Name, Adresse, …"
          aria-label="Suchen"
          className="h-8 w-full rounded-md border border-border bg-white pr-8 pl-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <SearchIcon className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </label>

      <FilterKnopf icon={<MonitorIcon />} label={archiv ? "Archiv" : "Aktiv"} aktiv breite="w-40">
        <ul className="p-1">
          {[
            ["", "Aktiv", MonitorIcon],
            ["1", "Archiv", ArchiveIcon],
          ].map(([wert, name, Icon]) => {
            const I = Icon as typeof MonitorIcon;
            return (
              <li key={String(wert)}>
                <PopoverClose
                  render={<button type="button" />}
                  onClick={() => setzen({ archiv: wert ? "1" : null })}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
                >
                  <I className="size-3.5 text-muted-foreground" /> {String(name)}
                </PopoverClose>
              </li>
            );
          })}
        </ul>
      </FilterKnopf>

      <FilterKnopf icon={<CalendarIcon />} label={datumText} aktiv={Boolean(zeitraum)} breite="w-auto">
        <ZeitraumWahl wert={zeitraum} heute={heute} onSpeichern={(z) => setzen({ von: z?.von ?? null, bis: z?.bis ?? null })} />
      </FilterKnopf>

      <FilterKnopf icon={<TagIcon />} label="Status" aktiv={statusIds.length > 0} anzahl={statusIds.length} breite="w-60">
        <MehrfachListe suche={false} optionen={statusOptionen} gewaehlt={statusIds} onAendern={(ids) => setzen({ status: ids.join(",") || null })} />
      </FilterKnopf>

      <FilterKnopf icon={<UserIcon />} label="Mitarbeiter" aktiv={mitarbeiterIds.length > 0} anzahl={mitarbeiterIds.length} breite="w-60">
        <MehrfachListe optionen={personenOptionen} gewaehlt={mitarbeiterIds} onAendern={(ids) => setzen({ mitarbeiter: ids.join(",") || null })} />
      </FilterKnopf>
    </div>
  );
}
