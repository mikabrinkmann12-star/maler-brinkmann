"use client";

import { useRouter } from "next/navigation";
import { Auswahl } from "@/components/feld";
import { PROJEKT_SORT_TEXT, type ProjektSortierungsName } from "./sortierung";

/** Status und Sortierung: wirkt sofort beim Auswählen, Suche und Archiv-Filter bleiben erhalten. */
export function Filterleiste({
  basis,
  sortierung,
  statusId,
  status,
}: {
  basis: Record<string, string>;
  sortierung: ProjektSortierungsName;
  statusId: string;
  status: { id: string; name: string }[];
}) {
  const router = useRouter();

  function setzen(teil: Record<string, string>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...basis, sortierung, status: statusId, ...teil })) {
      if (v && !(k === "sortierung" && v === "neu")) p.set(k, v);
    }
    router.push(`/buero/projekte${p.size ? `?${p}` : ""}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Status</span>
        <Auswahl value={statusId} onChange={(e) => setzen({ status: e.target.value })}>
          <option value="">Alle Status</option>
          {status.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Auswahl>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Sortieren nach</span>
        <Auswahl value={sortierung} onChange={(e) => setzen({ sortierung: e.target.value })}>
          {(Object.keys(PROJEKT_SORT_TEXT) as ProjektSortierungsName[]).map((s) => <option key={s} value={s}>{PROJEKT_SORT_TEXT[s]}</option>)}
        </Auswahl>
      </label>
    </div>
  );
}
