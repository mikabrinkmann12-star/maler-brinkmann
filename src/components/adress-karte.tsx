"use client";

import { useState } from "react";
import { ChevronDownIcon, MapPinIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";

/**
 * Adresse als Karte: Antippen klappt die Auswahl auf (Google Maps, Apple Karten, Adresse kopieren),
 * wie in Plancraft.
 */
export function AdressKarte({
  text,
  googleLink,
  appleLink,
  titel,
}: {
  text: string;
  googleLink: string;
  appleLink: string;
  titel: string;
}) {
  const [offen, setOffen] = useState(false);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Adresse kopiert.");
    } catch {
      toast.error("Kopieren hat nicht geklappt.");
    }
    setOffen(false);
  }

  const zeile = "flex min-h-12 items-center gap-3 px-4 py-2 text-base transition-colors hover:bg-muted";

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted"
      >
        <MapPinIcon className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-muted-foreground">{titel}</span>
          <span className="block font-medium text-primary underline-offset-4">{text}</span>
        </span>
        <ChevronDownIcon className={cn("size-5 shrink-0 text-muted-foreground transition-transform", offen && "rotate-180")} />
      </button>
      {offen && (
        <ul className="flex flex-col divide-y border-t">
          <li><a href={googleLink} target="_blank" rel="noopener noreferrer" className={zeile}>Google Maps</a></li>
          <li><a href={appleLink} target="_blank" rel="noopener noreferrer" className={zeile}>Apple Karten</a></li>
          <li><button type="button" onClick={kopieren} className={cn(zeile, "w-full text-left")}>Adresse kopieren</button></li>
        </ul>
      )}
    </div>
  );
}
