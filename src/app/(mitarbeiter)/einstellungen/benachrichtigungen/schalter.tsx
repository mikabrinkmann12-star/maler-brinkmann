"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { BENACHRICHTIGUNGEN, type BenachrichtigungenWahl } from "@/lib/profil";
import { benachrichtigungenSpeichern } from "../actions";

export function Schalter({ start }: { start: BenachrichtigungenWahl }) {
  const [wahl, setWahl] = useState(start);
  const [, starten] = useTransition();

  function umschalten(schluessel: keyof BenachrichtigungenWahl) {
    const alt = wahl;
    const neu = { ...wahl, [schluessel]: !wahl[schluessel] };
    setWahl(neu);
    starten(async () => {
      const antwort = await benachrichtigungenSpeichern(neu);
      if (antwort.fehler) {
        setWahl(alt);
        toast.error(antwort.fehler);
      }
    });
  }

  return (
    <>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Handy-Benachrichtigungen (Push) sind noch nicht eingeschaltet. Deine Auswahl wird schon gespeichert und gilt, sobald es sie gibt.
      </p>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        {BENACHRICHTIGUNGEN.map(({ schluessel, name, text }) => {
          const an = wahl[schluessel];
          return (
            <li key={schluessel} className="flex items-center gap-4 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium">{name}</span>
                <span className="block text-sm text-muted-foreground">{text}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={an}
                aria-label={name}
                onClick={() => umschalten(schluessel)}
                className={cn(
                  "relative h-8 w-14 shrink-0 rounded-full transition-colors",
                  an ? "bg-primary" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform",
                    an && "translate-x-6",
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
