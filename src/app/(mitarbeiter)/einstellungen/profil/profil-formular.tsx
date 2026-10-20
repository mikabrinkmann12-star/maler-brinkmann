"use client";

import { useActionState } from "react";
import { CheckIcon } from "lucide-react";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { profilSpeichern, type EinstellungErgebnis } from "../actions";

const START: EinstellungErgebnis = {};

// Unkontrollierte Felder (defaultValue): Nach dem Speichern lädt die Seite neu
// und die Felder zeigen den gespeicherten Wert.
export function ProfilFormular({ vorname, nachname, telefon }: { vorname: string; nachname: string; telefon: string }) {
  const [zustand, aktion, laeuft] = useActionState(profilSpeichern, START);

  return (
    <form action={aktion} className="flex flex-col gap-5" key={`${vorname}|${nachname}|${telefon}`}>
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}
      {zustand.ok && (
        <FormularMeldung art="hinweis">
          <span className="flex items-center gap-2"><CheckIcon className="size-4" /> Gespeichert.</span>
        </FormularMeldung>
      )}
      <Feld label="Vorname *" htmlFor="vorname">
        <Input id="vorname" name="vorname" defaultValue={vorname} required maxLength={50} autoComplete="given-name" className="h-12 text-base" />
      </Feld>
      <Feld label="Nachname" htmlFor="nachname">
        <Input id="nachname" name="nachname" defaultValue={nachname} maxLength={50} autoComplete="family-name" className="h-12 text-base" />
      </Feld>
      <Feld label="Mobilnummer" htmlFor="telefon" hinweis="Deine Kollegen sehen die Nummer und können dich anrufen.">
        <Input id="telefon" name="telefon" type="tel" defaultValue={telefon} maxLength={30} autoComplete="tel" className="h-12 text-base" />
      </Feld>
      <Button type="submit" size="touch" disabled={laeuft}>
        {laeuft ? "Speichern …" : "Speichern"}
      </Button>
    </form>
  );
}
