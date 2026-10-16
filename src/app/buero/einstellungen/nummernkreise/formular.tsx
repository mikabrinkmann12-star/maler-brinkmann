"use client";

import { useActionState } from "react";
import { CheckIcon } from "lucide-react";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abschicken } from "@/lib/formular";
import { nummernkreisSpeichern, type NummernkreisZustand } from "./actions";

const START: NummernkreisZustand = {};

export function NummernkreisFormular({ start, vorschlag }: { start: number; vorschlag: string }) {
  const [zustand, aktion, laeuft] = useActionState(nummernkreisSpeichern, START);
  return (
    // onSubmit statt action={…}: siehe abschicken() in src/lib/formular.ts
    <form onSubmit={(e) => abschicken(e, aktion)} className="flex flex-col gap-5">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}
      <Feld
        label="Höchste Projektnummer in Plancraft"
        htmlFor="projekt_start"
        hinweis={<>Nur die laufende Nummer zählt (bei P-(2400)447 ist das 447). Leer = unbekannt. Der nächste Vorschlag ist dann <strong>{vorschlag}</strong>.</>}
      >
        <Input id="projekt_start" name="projekt_start" defaultValue={start ? String(start) : ""} inputMode="numeric"
          placeholder="z. B. 512 oder P-(2600)512" className="h-12 max-w-xs text-base" />
      </Feld>
      <div className="flex items-center gap-3">
        <Button type="submit" size="touch" disabled={laeuft}>{laeuft ? "Speichern …" : "Speichern"}</Button>
        {zustand.gespeichert && !zustand.fehler && !laeuft && (
          <span role="status" className="flex items-center gap-1 text-sm text-green-700"><CheckIcon className="size-4" /> Gespeichert</span>
        )}
      </div>
    </form>
  );
}
