"use client";

import { useRouter } from "next/navigation";
import { Auswahl } from "@/components/feld";
import { FEHLT, SORTIERUNGEN, type Fehlt, type Sortierung } from "@/lib/kontakt-liste";

/** Sortierung, Ort und „Es fehlt …“: wirkt sofort beim Auswählen, Suche und Typ bleiben erhalten. */
export function Filterleiste({
  basis,
  sortierung,
  ort,
  fehlt,
  orte,
}: {
  /** Aktuelle Adresse ohne die drei Filter, z. B. "/buero/kontakte?q=meyer&typ=privat" */
  basis: Record<string, string>;
  sortierung: Sortierung;
  ort: string;
  fehlt: Fehlt | "";
  orte: { ort: string; anzahl: number }[];
}) {
  const router = useRouter();

  function setzen(teil: Record<string, string>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...basis, sortierung, ort, fehlt, ...teil })) {
      if (v && !(k === "sortierung" && v === "name_auf")) p.set(k, v);
    }
    router.push(`/buero/kontakte${p.size ? `?${p}` : ""}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Sortieren nach</span>
        <Auswahl value={sortierung} onChange={(e) => setzen({ sortierung: e.target.value })}>
          {(Object.keys(SORTIERUNGEN) as Sortierung[]).map((s) => <option key={s} value={s}>{SORTIERUNGEN[s]}</option>)}
        </Auswahl>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Ort</span>
        <Auswahl value={ort} onChange={(e) => setzen({ ort: e.target.value })}>
          <option value="">Alle Orte</option>
          {orte.map((o) => <option key={o.ort} value={o.ort}>{o.ort} ({o.anzahl})</option>)}
        </Auswahl>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Es fehlt …</span>
        <Auswahl value={fehlt} onChange={(e) => setzen({ fehlt: e.target.value })}>
          <option value="">Egal</option>
          {(Object.keys(FEHLT) as Fehlt[]).map((f) => <option key={f} value={f}>{FEHLT[f]}</option>)}
        </Auswahl>
      </label>
    </div>
  );
}
