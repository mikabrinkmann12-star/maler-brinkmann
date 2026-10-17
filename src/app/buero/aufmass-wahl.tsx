"use client";

import { useState, useTransition } from "react";
import { RulerIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormularMeldung } from "@/components/formular-meldung";
import { formatZahl } from "@/lib/format";
import { aufmassSortiert, type AufmassAuswahl } from "@/lib/aufmass-auswahl";
import { aufmassFuerProjekt } from "./aufmass-actions";

/**
 * Knopf „Aus Aufmaß“ bei einer Position: zeigt die Aufmaß-Summen der Baustelle, ein Tipp übernimmt Menge und Einheit in die Position.
 * Passende Einträge (Name kommt im Text der Position vor) stehen oben. Es wird nichts gespeichert, das macht der Knopf der Position.
 */
export function AufmassWahl({
  projektId,
  positionsText,
  gesperrt,
  onWahl,
}: {
  projektId: string;
  positionsText: string;
  gesperrt: boolean;
  onWahl: (menge: number, einheit: string) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [liste, setListe] = useState<AufmassAuswahl[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function oeffnen() {
    if (offen) return setOffen(false);
    setOffen(true);
    setFehler(null);
    starte(async () => {
      const r = await aufmassFuerProjekt(projektId);
      if (r.fehler) return setFehler(r.fehler);
      setListe(r.liste ?? []);
    });
  }

  if (gesperrt) return null;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" variant="outline" size="sm" onClick={oeffnen} disabled={laeuft}>
          <RulerIcon /> {offen ? "Aufmaß schließen" : "Aus Aufmaß"}
        </Button>
      </div>
      {offen && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
          {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
          {laeuft && <p className="text-sm text-muted-foreground">Aufmaß wird geladen …</p>}
          {liste && liste.length === 0 && <p className="text-sm text-muted-foreground">Für diese Baustelle gibt es noch kein Aufmaß.</p>}
          {liste && liste.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border bg-card">
              {aufmassSortiert(liste, positionsText).map(({ eintrag, passt }) => (
                <li key={`${eintrag.position}|${eintrag.einheit}`} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {eintrag.position}
                    {passt && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">passt</span>}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatZahl(eintrag.menge, { min: 0, max: 3 })} {eintrag.einheit}</span>
                  <Button type="button" size="sm" onClick={() => { onWahl(eintrag.menge, eintrag.einheit); setOffen(false); }}>Übernehmen</Button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOffen(false)}><XIcon /> Schließen</Button>
          </div>
        </div>
      )}
    </div>
  );
}
