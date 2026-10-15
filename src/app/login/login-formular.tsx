"use client";

import { useActionState } from "react";
import { FormularMeldung } from "@/components/formular-meldung";
import { PasswortFeld } from "@/components/passwort-feld";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { anmelden, type LoginZustand } from "./actions";

const START: LoginZustand = { benutzername: "" };

export function LoginFormular({ hinweis }: { hinweis?: string }) {
  const [zustand, aktion, laeuft] = useActionState(anmelden, START);

  return (
    <form action={aktion} className="flex flex-col gap-5">
      {zustand.fehler ? (
        <FormularMeldung>{zustand.fehler}</FormularMeldung>
      ) : (
        hinweis && <FormularMeldung art="hinweis">{hinweis}</FormularMeldung>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="benutzername" className="text-base">
          Benutzername
        </Label>
        <Input
          id="benutzername"
          name="benutzername"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={zustand.benutzername}
          className="h-12 text-base"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="passwort" className="text-base">
          Passwort
        </Label>
        <PasswortFeld
          id="passwort"
          name="passwort"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" size="touch" disabled={laeuft} className="mt-1">
        {laeuft ? "Anmelden …" : "Anmelden"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Passwort vergessen? Bitte im Büro melden.
      </p>
    </form>
  );
}
