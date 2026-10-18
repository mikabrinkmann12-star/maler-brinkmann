"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "lucide-react";
import { useUrlFilter } from "@/components/listen/url-filter";

/** Suchfeld einer Liste (Adresse `?q=`): übernimmt den Text kurz nach dem Tippen oder mit Enter, die Seite beginnt wieder vorn. */
export function SuchFeld({ q, platzhalter, className = "w-60" }: { q: string; platzhalter: string; className?: string }) {
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

  return (
    <label className={`relative ${className}`}>
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
  );
}
