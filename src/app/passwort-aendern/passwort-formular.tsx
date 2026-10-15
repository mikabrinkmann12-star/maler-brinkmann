"use client";

import { useActionState } from "react";
import { FormularMeldung } from "@/components/formular-meldung";
import { PasswortFeld } from "@/components/passwort-feld";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORT_LAENGE } from "@/lib/login";
import { passwortAendern, type PasswortZustand } from "./actions";

const START: PasswortZustand = {};

export function PasswortFormular() {
  const [zustand, aktion, laeuft] = useActionState(passwortAendern, START);

  return (
    <form action={aktion} className="flex flex-col gap-5">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="passwort" className="text-base">
          Neues Passwort
        </Label>
        <PasswortFeld
          id="passwort"
          name="passwort"
          autoComplete="new-password"
          minLength={MIN_PASSWORT_LAENGE}
          required
        />
        <p className="text-sm text-muted-foreground">
          Mindestens {MIN_PASSWORT_LAENGE} Zeichen. Tipp: ein kurzer Satz, z. B.
          „Blauer Eimer an der Wand“.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="wiederholung" className="text-base">
          Neues Passwort wiederholen
        </Label>
        <PasswortFeld
          id="wiederholung"
          name="wiederholung"
          autoComplete="new-password"
          minLength={MIN_PASSWORT_LAENGE}
          required
        />
      </div>

      <Button type="submit" size="touch" disabled={laeuft}>
        {laeuft ? "Speichern …" : "Passwort speichern"}
      </Button>
    </form>
  );
}
