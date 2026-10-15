"use client";

import { useActionState, useState } from "react";
import { LockIcon, UnlockIcon } from "lucide-react";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import {
  type SperreZustand,
  zugangEntsperren,
  zugangSperren,
} from "../actions";

const START: SperreZustand = {};

export function ZugangSperren({
  id,
  vorname,
  aktiv,
}: {
  id: string;
  vorname: string;
  aktiv: boolean;
}) {
  const [sperrZustand, sperren, sperrt] = useActionState(zugangSperren.bind(null, id), START);
  const [entsperrZustand, entsperren, entsperrt] = useActionState(
    zugangEntsperren.bind(null, id),
    START,
  );
  const [bestaetigen, setBestaetigen] = useState(false);
  const fehler = aktiv ? sperrZustand.fehler : entsperrZustand.fehler;

  if (!aktiv) {
    return (
      <form action={entsperren} className="flex flex-col gap-3">
        {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
        <p className="text-sm text-muted-foreground">
          {vorname} ist gesperrt und kann sich nicht anmelden.
        </p>
        <Button type="submit" variant="outline" size="lg" disabled={entsperrt} className="w-fit">
          <UnlockIcon />
          {entsperrt ? "Wird entsperrt …" : "Zugang wieder freigeben"}
        </Button>
      </form>
    );
  }

  return (
    <form action={sperren} className="flex flex-col gap-3">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <p className="text-sm text-muted-foreground">
        Gesperrt kann sich {vorname} nicht mehr anmelden und wird auf allen
        Geräten sofort abgemeldet. Zeiten und Daten bleiben erhalten.
      </p>
      {bestaetigen ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="destructive" size="lg" disabled={sperrt}>
            {sperrt ? "Wird gesperrt …" : `Ja, ${vorname} sperren`}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => setBestaetigen(false)}>
            Abbrechen
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="lg" className="w-fit"
          onClick={() => setBestaetigen(true)}>
          <LockIcon />
          Zugang sperren
        </Button>
      )}
    </form>
  );
}
