"use client";

import { useEffect, useRef, useState } from "react";
import { ArchiveIcon, BuildingIcon, CircleAlertIcon, MapPinIcon, MonitorIcon, PaletteIcon, SearchIcon, UserIcon } from "lucide-react";
import { FilterKnopf } from "@/components/listen/filter-knopf";
import { MehrfachListe, type ListenOption } from "@/components/listen/mehrfach-liste";
import { useUrlFilter } from "@/components/listen/url-filter";
import { PopoverClose } from "@/components/ui/popover";
import { FEHLT, type Fehlt } from "@/lib/kontakt-liste";
import { KONTAKT_FARBEN } from "@/lib/kontakt-farben";

const TYPEN: ListenOption[] = [
  { id: "privat", text: "Person", anzeige: <span className="flex items-center gap-2"><UserIcon className="size-3.5 text-muted-foreground" /> Person</span> },
  { id: "firma", text: "Firma", anzeige: <span className="flex items-center gap-2"><BuildingIcon className="size-3.5 text-muted-foreground" /> Firma</span> },
];

const FARB_OPTIONEN: ListenOption[] = KONTAKT_FARBEN.map((f) => ({
  id: f.id,
  text: f.name,
  anzeige: (
    <span className="flex items-center gap-2">
      <span className="size-3 rounded-full" style={{ backgroundColor: f.wert }} /> {f.name}
    </span>
  ),
}));

/** Suchzeile und Filterknöpfe der Kontaktliste (Aktiv/Archiv, Farbe, Typ, Ort, „Es fehlt …“), alles in der Adresse gespeichert. */
export function KontakteFilter({
  archiv,
  q,
  farben,
  typen,
  orte,
  gewaehlteOrte,
  fehlt,
}: {
  archiv: boolean;
  q: string;
  farben: string[];
  typen: string[];
  orte: { ort: string; anzahl: number }[];
  /** Orte sind in der Adresse mit „|“ getrennt (ein Ortsname kann ein Komma enthalten) */
  gewaehlteOrte: string[];
  fehlt: Fehlt | "";
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

  const ortOptionen: ListenOption[] = orte.map((o) => ({ id: o.ort, text: o.ort, anzeige: <span>{o.ort} <span className="text-muted-foreground">({o.anzahl})</span></span> }));

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
          placeholder="Suche nach Name, Ort, Nummer, …"
          aria-label="Suchen"
          className="h-8 w-full rounded-md border border-border bg-white pr-8 pl-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <SearchIcon className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </label>

      <FilterKnopf icon={<MonitorIcon />} label={archiv ? "Archiv" : "Aktiv"} aktiv breite="w-40">
        <ul className="p-1">
          {([["", "Aktiv", MonitorIcon], ["1", "Archiv", ArchiveIcon]] as const).map(([wert, name, Icon]) => (
            <li key={wert}>
              <PopoverClose
                render={<button type="button" />}
                onClick={() => setzen({ archiv: wert || null })}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
              >
                <Icon className="size-3.5 text-muted-foreground" /> {name}
              </PopoverClose>
            </li>
          ))}
        </ul>
      </FilterKnopf>

      <FilterKnopf icon={<PaletteIcon />} label="Farbe" aktiv={farben.length > 0} anzahl={farben.length} breite="w-52">
        <MehrfachListe suche={false} optionen={FARB_OPTIONEN} gewaehlt={farben} onAendern={(ids) => setzen({ farbe: ids.join(",") || null })} />
      </FilterKnopf>

      <FilterKnopf icon={<UserIcon />} label="Typ" aktiv={typen.length > 0} anzahl={typen.length} breite="w-48">
        <MehrfachListe suche={false} optionen={TYPEN} gewaehlt={typen} onAendern={(ids) => setzen({ typ: ids.join(",") || null })} />
      </FilterKnopf>

      <FilterKnopf icon={<MapPinIcon />} label="Ort" aktiv={gewaehlteOrte.length > 0} anzahl={gewaehlteOrte.length} breite="w-64">
        <MehrfachListe optionen={ortOptionen} gewaehlt={gewaehlteOrte} onAendern={(ids) => setzen({ ort: ids.join("|") || null })} />
      </FilterKnopf>

      <FilterKnopf icon={<CircleAlertIcon />} label={fehlt ? `Fehlt: ${FEHLT[fehlt]}` : "Es fehlt …"} aktiv={Boolean(fehlt)} breite="w-52">
        <ul className="p-1">
          {([["", "Egal"], ...Object.entries(FEHLT)] as [string, string][]).map(([wert, name]) => (
            <li key={wert}>
              <PopoverClose
                render={<button type="button" />}
                onClick={() => setzen({ fehlt: wert || null })}
                className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
              >
                {name}
              </PopoverClose>
            </li>
          ))}
        </ul>
      </FilterKnopf>
    </div>
  );
}
