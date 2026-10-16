"use client";

import { useRouter } from "next/navigation";
import { Auswahl } from "@/components/feld";

type Option = { id: string; name: string };

/** Mitarbeiter, Baustelle und Art: wirkt sofort beim Auswählen, der Monat bleibt erhalten. */
export function Filterleiste({
  monat,
  personId,
  projektId,
  art,
  personen,
  projekte,
  arten,
}: {
  monat: string;
  personId: string;
  projektId: string;
  art: string;
  personen: Option[];
  projekte: Option[];
  arten: Option[];
}) {
  const router = useRouter();

  function setzen(teil: Record<string, string>) {
    const p = new URLSearchParams({ monat });
    for (const [k, v] of Object.entries({ person: personId, projekt: projektId, art, ...teil })) {
      if (v) p.set(k, v);
    }
    router.push(`/buero/zeiten?${p}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Mitarbeiter</span>
        <Auswahl value={personId} onChange={(e) => setzen({ person: e.target.value })}>
          <option value="">Alle Mitarbeiter</option>
          {personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Auswahl>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Baustelle</span>
        <Auswahl value={projektId} onChange={(e) => setzen({ projekt: e.target.value })}>
          <option value="">Alle Baustellen</option>
          {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Auswahl>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Art</span>
        <Auswahl value={art} onChange={(e) => setzen({ art: e.target.value })}>
          <option value="">Alle Arten</option>
          {arten.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Auswahl>
      </label>
    </div>
  );
}
