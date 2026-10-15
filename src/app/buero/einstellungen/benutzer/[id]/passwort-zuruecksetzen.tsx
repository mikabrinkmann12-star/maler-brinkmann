"use client";

import { useActionState, useState } from "react";
import { KeyRoundIcon } from "lucide-react";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { passwortZuruecksetzen, type PasswortZustand } from "../actions";
import { Zugangsdaten } from "../zugangsdaten";

const START: PasswortZustand = {};

export function PasswortZuruecksetzen({
  id,
  vorname,
  benutzername,
}: {
  id: string;
  vorname: string;
  benutzername: string;
}) {
  const [zustand, aktion, laeuft] = useActionState(
    passwortZuruecksetzen.bind(null, id),
    START,
  );
  const [bestaetigen, setBestaetigen] = useState(false);

  if (zustand.neuesPasswort) {
    return (
      <div className="flex flex-col gap-3">
        <p>Neues Startpasswort für {vorname}:</p>
        <Zugangsdaten benutzername={benutzername} passwort={zustand.neuesPasswort} />
      </div>
    );
  }

  return (
    <form action={aktion} className="flex flex-col gap-3">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}
      <p className="text-sm text-muted-foreground">
        Erzeugt ein neues Startpasswort. {vorname} wird auf allen Geräten
        abgemeldet und muss beim nächsten Anmelden ein eigenes Passwort festlegen.
      </p>
      {bestaetigen ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={laeuft}>
            {laeuft ? "Wird zurückgesetzt …" : "Ja, zurücksetzen"}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => setBestaetigen(false)}>
            Abbrechen
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="lg" className="w-fit"
          onClick={() => setBestaetigen(true)}>
          <KeyRoundIcon />
          Passwort zurücksetzen
        </Button>
      )}
    </form>
  );
}
