"use client";

import { useTransition } from "react";
import Link from "next/link";
import { CheckIcon, PackageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDatumZeit, formatZahl } from "@/lib/format";
import { materialErledigt } from "../(mitarbeiter)/baustellen/actions";

export type OffeneMeldung = {
  id: string;
  material: string;
  menge: number;
  einheit: string;
  bemerkung: string | null;
  projektId: string;
  projektName: string;
  wer: string;
  created_at: string;
};

/** Offene Material-Meldungen aller Baustellen. Abhaken = besorgt/erledigt. */
export function MaterialMeldungen({ meldungen }: { meldungen: OffeneMeldung[] }) {
  const [laeuft, starte] = useTransition();

  function abhaken(m: OffeneMeldung) {
    starte(async () => {
      try {
        const r = await materialErledigt(m.id, true);
        if (r.fehler) toast.error(r.fehler);
        else toast.success(`„${m.material}“ ist erledigt.`);
      } catch {
        toast.error("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <PackageIcon className="size-5" /> Material-Meldungen
        {meldungen.length > 0 && (
          <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{meldungen.length}</span>
        )}
      </h2>
      {meldungen.length === 0 && <p className="text-sm text-muted-foreground">Nichts offen.</p>}
      <ul className="flex flex-col divide-y">
        {meldungen.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">{formatZahl(m.menge)} {m.einheit} {m.material}</p>
              {m.bemerkung && <p className="text-sm">{m.bemerkung}</p>}
              <p className="text-xs text-muted-foreground">
                <Link href={`/baustellen/${m.projektId}#material`} className="underline-offset-4 hover:underline">{m.projektName}</Link>
                {" · "}{m.wer} · {formatDatumZeit(m.created_at)}
              </p>
            </div>
            <Button type="button" variant="outline" size="icon-lg" aria-label="Als erledigt abhaken"
              disabled={laeuft} onClick={() => abhaken(m)}>
              <CheckIcon />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
