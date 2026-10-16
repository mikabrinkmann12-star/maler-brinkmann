"use client";

import { useActionState, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abschicken } from "@/lib/formular";
import { formatZahl } from "@/lib/format";
import { WOCHENTAGE_KURZ } from "@/lib/ueberstunden";
import { stundenEingabeLesen } from "@/lib/zeit-schema";
import { arbeitszeitSpeichern } from "../actions";
import type { SpeichernZustand } from "../actions";

const START: SpeichernZustand = {};
const FELDER = ["sollMo", "sollDi", "sollMi", "sollDo", "sollFr"] as const;

export type ArbeitszeitStart = {
  /** Soll je Wochentag als Text; leer = Standard */
  soll: [string, string, string, string, string];
  kontoAb: string;
  anfangssaldo: string;
};

export function ArbeitszeitFormular({
  id,
  start,
  standard,
}: {
  id: string;
  start: ArbeitszeitStart;
  /** Standard-Soll aus den Einstellungen (nur als Platzhalter gezeigt) */
  standard: number[];
}) {
  const [zustand, aktion, laeuft] = useActionState(arbeitszeitSpeichern.bind(null, id), START);
  const [soll, setSoll] = useState(start.soll);
  const [kontoAb, setKontoAb] = useState(start.kontoAb);
  const [anfangssaldo, setAnfangssaldo] = useState(start.anfangssaldo);

  const summe = soll.reduce((s, t, i) => s + (t.trim() === "" ? standard[i] : stundenEingabeLesen(t) ?? 0), 0);

  return (
    // onSubmit statt action={…}: siehe abschicken() in src/lib/formular.ts
    <form onSubmit={(e) => abschicken(e, aktion)} className="flex flex-col gap-5">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-base font-medium">Soll-Stunden pro Tag</legend>
        <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {FELDER.map((name, i) => (
            <Feld key={name} label={WOCHENTAGE_KURZ[i]} htmlFor={name}>
              <Input id={name} name={name} inputMode="decimal" value={soll[i]}
                placeholder={formatZahl(standard[i])}
                onChange={(e) => setSoll((alt) => alt.map((w, j) => (j === i ? e.target.value : w)) as typeof alt)}
                className="h-12 px-2 text-center text-base" />
            </Feld>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Leer = Standard (grau angezeigt, aus den Einstellungen „Zeiterfassung“). Bei Teilzeit die eigenen Stunden eintragen, an freien Tagen <strong>0</strong>.
          Eingabe z. B. 8,5 oder 7:30. Das Soll gilt rückwirkend für alle Tage ab „Konto ab“. Samstag, Sonntag und Feiertage in Niedersachsen haben immer Soll 0.
          Soll pro Woche: <strong>{formatZahl(Math.round(summe * 100) / 100)} Std</strong>.
        </p>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Feld label="Überstundenkonto ab" htmlFor="kontoAb"
          hinweis="Erster Tag, der zählt. Leer = für diese Person wird kein Konto geführt.">
          <Input id="kontoAb" name="kontoAb" type="date" value={kontoAb}
            onChange={(e) => setKontoAb(e.target.value)} className="h-12 text-base" />
        </Feld>
        <Feld label="Anfangssaldo (Std)" htmlFor="anfangssaldo"
          hinweis="Überstunden-Stand an diesem Tag, z. B. aus Plancraft. Minus mit „-“, z. B. -3:30.">
          <Input id="anfangssaldo" name="anfangssaldo" inputMode="text" value={anfangssaldo} placeholder="0"
            onChange={(e) => setAnfangssaldo(e.target.value)} className="h-12 w-40 text-base" />
        </Feld>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="touch" disabled={laeuft}>
          {laeuft ? "Speichern …" : "Speichern"}
        </Button>
        {zustand.gespeichert && !zustand.fehler && !laeuft && (
          <span role="status" className="flex items-center gap-1 text-sm text-green-700">
            <CheckIcon className="size-4" />
            Gespeichert
          </span>
        )}
      </div>
    </form>
  );
}
