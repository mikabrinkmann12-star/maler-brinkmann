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

export function NummernkreisFormular({
  start,
  vorschlag,
  rechnungPraefix,
  rechnungStart,
  bereitsVergeben,
  gutschriftPraefix,
  gutschriftStart,
  gutschriftBereitsVergeben,
  jahr,
}: {
  start: number;
  vorschlag: string;
  rechnungPraefix: string;
  rechnungStart: number;
  /** Im laufenden Jahr gibt es schon eine Rechnungsnummer: die Startnummer wirkt dann erst im nächsten Jahr */
  bereitsVergeben: boolean;
  gutschriftPraefix: string;
  gutschriftStart: number;
  gutschriftBereitsVergeben: boolean;
  jahr: number;
}) {
  const [zustand, aktion, laeuft] = useActionState(nummernkreisSpeichern, START);
  return (
    // onSubmit statt action={…}: siehe abschicken() in src/lib/formular.ts
    <form onSubmit={(e) => abschicken(e, aktion)} className="flex flex-col gap-5">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}
      <Feld
        label="Höchste Projektnummer in Plancraft"
        htmlFor="projekt_start"
        hinweis={<>Nur die laufende Nummer zählt (bei P-(2400)447 ist das 447). Leer = Standard 602 (Plancraft, Stand 18.10.2026). Der nächste Vorschlag ist dann <strong>{vorschlag}</strong>.</>}
      >
        <Input id="projekt_start" name="projekt_start" defaultValue={start ? String(start) : ""} inputMode="numeric"
          placeholder="z. B. 602 oder P-(2400)602" className="h-12 max-w-xs text-base" />
      </Feld>
      <Feld
        label="Rechnungsnummern: Kürzel"
        htmlFor="rechnung_praefix"
        hinweis={<>Davor steht das Jahr und die laufende Nummer, z. B. <strong>{rechnungPraefix}{jahr}-0001</strong>. Höchstens 10 Zeichen, keine Leerzeichen.</>}
      >
        <Input id="rechnung_praefix" name="rechnung_praefix" defaultValue={rechnungPraefix} maxLength={10} placeholder="R-" className="h-12 max-w-xs text-base" />
      </Feld>
      <Feld
        label="Rechnungsnummern: Startnummer"
        htmlFor="rechnung_start"
        hinweis={bereitsVergeben ? <>Im Jahr {jahr} gibt es schon eine Rechnungsnummer, die Datenbank zählt von dort weiter. Eine neue Startnummer wirkt erst für das nächste Jahr.</> : <>Mit dieser Nummer beginnt die erste Rechnung des Jahres {jahr} (z. B. wenn schon Rechnungen woanders geschrieben wurden). Leer = 1. Danach zählt die App lückenlos weiter.</>}
      >
        <Input id="rechnung_start" name="rechnung_start" defaultValue={String(rechnungStart)} inputMode="numeric" className="h-12 max-w-xs text-base" />
      </Feld>
      <Feld
        label="Gutschriften und Stornos: Kürzel"
        htmlFor="gutschrift_praefix"
        hinweis={<>Gutschriften und Stornos haben einen eigenen, lückenlosen Zähler, z. B. <strong>{gutschriftPraefix}{jahr}-0001</strong>. Muss sich vom Rechnungs-Kürzel unterscheiden.</>}
      >
        <Input id="gutschrift_praefix" name="gutschrift_praefix" defaultValue={gutschriftPraefix} maxLength={10} placeholder="G-" className="h-12 max-w-xs text-base" />
      </Feld>
      <Feld
        label="Gutschriften und Stornos: Startnummer"
        htmlFor="gutschrift_start"
        hinweis={gutschriftBereitsVergeben ? <>Im Jahr {jahr} gibt es schon eine Gutschriftsnummer, die Datenbank zählt von dort weiter. Eine neue Startnummer wirkt erst für das nächste Jahr.</> : <>Mit dieser Nummer beginnt die erste Gutschrift des Jahres {jahr}. Leer = 1.</>}
      >
        <Input id="gutschrift_start" name="gutschrift_start" defaultValue={String(gutschriftStart)} inputMode="numeric" className="h-12 max-w-xs text-base" />
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
