"use client";

import { useActionState, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatStunden } from "@/lib/format";
import { abschicken } from "@/lib/formular";
import {
  MAX_KULANZ_TAGE,
  MAX_PAUSE_MIN,
  ZEIT_ARTEN,
  ZEIT_ART_NAMEN,
  arbeitsMinuten,
  type ZeitArt,
  type ZeiterfassungEinstellungen,
} from "@/lib/zeiten";
import { einstellungenSpeichern, type EinstellungenZustand } from "./actions";

const START: EinstellungenZustand = {};

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-xl border p-5">
      <legend className="px-1 text-lg font-semibold">{titel}</legend>
      {children}
    </fieldset>
  );
}

export function ZeiterfassungFormular({ werte }: { werte: ZeiterfassungEinstellungen }) {
  const [zustand, aktion, laeuft] = useActionState(einstellungenSpeichern, START);
  const [arten, setArten] = useState<ZeitArt[]>(werte.erlaubteArten);
  const [beginn, setBeginn] = useState(werte.standardBeginn);
  const [ende, setEnde] = useState(werte.standardEnde);
  const [pause, setPause] = useState(String(werte.standardPauseMin));
  const [kulanz, setKulanz] = useState(String(werte.kulanzTage));

  const rechnung = arbeitsMinuten(beginn, ende, Number(pause) || 0);
  const kulanzZahl = Number(kulanz);

  function umschalten(art: ZeitArt, an: boolean) {
    setArten((alt) => (an ? [...alt, art] : alt.filter((a) => a !== art)));
  }

  return (
    // onSubmit statt action={…}: siehe abschicken() in src/lib/formular.ts
    <form onSubmit={(e) => abschicken(e, aktion)} className="flex flex-col gap-6">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}

      <Abschnitt titel="Erlaubte Arten für Mitarbeiter">
        <ul className="grid gap-2 sm:grid-cols-2">
          {ZEIT_ARTEN.map((art) => (
            <li key={art}>
              <label className="flex h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 has-checked:border-primary has-checked:bg-primary/5">
                <input
                  type="checkbox"
                  name="erlaubte_arten"
                  value={art}
                  checked={arten.includes(art)}
                  onChange={(e) => umschalten(art, e.target.checked)}
                  className="size-5 accent-primary"
                />
                {ZEIT_ART_NAMEN[art]}
              </label>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Nur diese Arten können Mitarbeiter selbst eintragen.</p>
      </Abschnitt>

      <Abschnitt titel="Standardzeiten">
        <p className="text-sm text-muted-foreground">So ist das Formular „Zeit eintragen“ vorausgefüllt.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Feld label="Beginn" htmlFor="standard_beginn">
            <Input id="standard_beginn" name="standard_beginn" type="time" required value={beginn}
              onChange={(e) => setBeginn(e.target.value)} className="h-12 text-base" />
          </Feld>
          <Feld label="Ende" htmlFor="standard_ende">
            <Input id="standard_ende" name="standard_ende" type="time" required value={ende}
              onChange={(e) => setEnde(e.target.value)} className="h-12 text-base" />
          </Feld>
          <Feld label="Pause (Minuten)" htmlFor="standard_pause_min">
            <Input id="standard_pause_min" name="standard_pause_min" type="number" inputMode="numeric"
              min={0} max={MAX_PAUSE_MIN} step={5} required value={pause}
              onChange={(e) => setPause(e.target.value)} className="h-12 text-base" />
          </Feld>
        </div>
        <p className="text-sm" role="status">
          {"minuten" in rechnung
            ? <>Ergibt <strong>{formatStunden(rechnung.minuten / 60)}</strong> pro Tag.</>
            : <span className="text-destructive">{rechnung.fehler}</span>}
        </p>
      </Abschnitt>

      <Abschnitt titel="Sperrfrist">
        <p className="text-sm text-muted-foreground">
          Mitarbeiter können ihre Zeiten bis zum Monatsende eintragen und ändern. Danach ist der Monat gesperrt,
          nur das Büro kann dann noch etwas ändern. Zeiten in der Zukunft gehen nie.
        </p>
        <Feld
          label="Kulanztage im Folgemonat"
          htmlFor="kulanz_tage"
          hinweis={
            Number.isInteger(kulanzZahl) && kulanzZahl > 0
              ? `Der Vormonat bleibt bis einschließlich zum ${kulanzZahl}. des neuen Monats offen.`
              : "0 = keine Kulanz, der Monat ist am 1. sofort gesperrt."
          }
        >
          <Input id="kulanz_tage" name="kulanz_tage" type="number" inputMode="numeric"
            min={0} max={MAX_KULANZ_TAGE} step={1} required value={kulanz}
            onChange={(e) => setKulanz(e.target.value)} className="h-12 w-32 text-base" />
        </Feld>
      </Abschnitt>

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
