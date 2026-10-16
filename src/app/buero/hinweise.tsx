"use client";

import { useTransition } from "react";
import Link from "next/link";
import { BellIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDatumZeit } from "@/lib/format";
import { hinweiseGelesen } from "./actions";

type Hinweis = { id: number; typ: string; text: string; project_id: string | null; created_at: string };

/** Wohin führt ein Hinweis? Baustelle bzw. Urlaubsanträge. */
function ziel(h: Hinweis): string | null {
  if (h.project_id) return `/baustellen/${h.project_id}`;
  if (h.typ === "urlaubsantrag") return "/buero/urlaub";
  if (h.typ === "termin") return "/buero/plantafel/termine";
  return null;
}

export function Hinweise({ hinweise }: { hinweise: Hinweis[] }) {
  const [laeuft, starte] = useTransition();

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BellIcon className="size-5" /> Hinweise
          {hinweise.length > 0 && (
            <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{hinweise.length}</span>
          )}
        </h2>
        {hinweise.length > 1 && (
          <Button type="button" variant="ghost" size="sm" disabled={laeuft}
            onClick={() => starte(() => hinweiseGelesen())}>
            Alle gelesen
          </Button>
        )}
      </div>
      {hinweise.length === 0 && <p className="text-sm text-muted-foreground">Keine neuen Hinweise.</p>}
      <ul className="flex flex-col divide-y">
        {hinweise.map((h) => (
          <li key={h.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p>
                {ziel(h) ? (
                  <Link href={ziel(h)!} className="underline-offset-4 hover:underline">{h.text}</Link>
                ) : h.text}
              </p>
              <p className="text-xs text-muted-foreground">{formatDatumZeit(h.created_at)}</p>
            </div>
            <Button type="button" variant="outline" size="icon-lg" aria-label="Als gelesen markieren"
              disabled={laeuft} onClick={() => starte(() => hinweiseGelesen(h.id))}>
              <CheckIcon />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
