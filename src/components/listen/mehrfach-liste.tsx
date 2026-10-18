"use client";

import { useState, type ReactNode } from "react";
import { SearchIcon } from "lucide-react";
import { cn } from "cn";

export type ListenOption = { id: string; text: string; anzeige?: ReactNode; gruppe?: string };

/**
 * Inhalt eines Filterfensters: optionales Suchfeld und Zeilen mit Kästchen (Mehrfachauswahl) oder runden Feldern (genau eine).
 * Die Auswahl wirkt sofort. `fuss` ist für Zusatzlinks wie „Status verwalten“.
 */
export function MehrfachListe({
  optionen,
  gewaehlt,
  onAendern,
  einzeln = false,
  suche = true,
  fuss,
}: {
  optionen: ListenOption[];
  gewaehlt: string[];
  onAendern: (neu: string[]) => void;
  einzeln?: boolean;
  suche?: boolean;
  fuss?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const treffer = optionen.filter((o) => o.text.toLowerCase().includes(q.trim().toLowerCase()));

  function umschalten(id: string) {
    if (einzeln) return onAendern([id]);
    onAendern(gewaehlt.includes(id) ? gewaehlt.filter((x) => x !== id) : [...gewaehlt, id]);
  }

  // Gruppenüberschrift nur vor dem ersten Eintrag einer Gruppe
  const mitKopf = treffer.map((o, i) => ({ o, kopf: o.gruppe && o.gruppe !== treffer[i - 1]?.gruppe ? o.gruppe : null }));
  return (
    <div className="flex max-h-80 flex-col">
      {suche && (
        <div className="p-2 pb-1">
          <label className="flex items-center gap-2 rounded-md border border-ring/60 px-2 ring-2 ring-ring/20">
            <SearchIcon className="size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Suchen…"
              aria-label="Suchen"
              className="h-8 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
      )}
      <ul className="flex-1 overflow-y-auto p-1">
        {treffer.length === 0 && <li className="px-2 py-3 text-center text-[13px] text-muted-foreground">Nichts gefunden</li>}
        {mitKopf.map(({ o, kopf }) => {
          const an = gewaehlt.includes(o.id);
          return (
            <li key={o.id}>
              {kopf && <p className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">{kopf}</p>}
              <button
                type="button"
                onClick={() => umschalten(o.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-muted"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center border",
                    einzeln ? "rounded-full" : "rounded-[3px]",
                    an ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {an && <span className={cn("bg-primary-foreground", einzeln ? "size-1.5 rounded-full" : "size-1.5 rounded-[1px]")} />}
                </span>
                {o.anzeige ?? <span className="truncate">{o.text}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {fuss && <div className="border-t p-1">{fuss}</div>}
    </div>
  );
}
