"use client";

import { useActionState, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abschicken } from "@/lib/formular";
import { ROLLEN_BESCHREIBUNG, type Rolle } from "@/lib/rollen";
import { nutzerSpeichern, type SpeichernZustand } from "../actions";

const START: SpeichernZustand = {};

export function StammdatenFormular({
  id,
  istSelbst,
  werte,
}: {
  id: string;
  istSelbst: boolean;
  werte: { vorname: string; nachname: string; rolle: Rolle; telefon: string; email: string };
}) {
  const [zustand, aktion, laeuft] = useActionState(nutzerSpeichern.bind(null, id), START);
  // Kontrollierte Felder: Eingaben bleiben bei einer Fehlermeldung erhalten.
  const [vorname, setVorname] = useState(werte.vorname);
  const [nachname, setNachname] = useState(werte.nachname);
  const [rolle, setRolle] = useState<string>(werte.rolle);
  const [telefon, setTelefon] = useState(werte.telefon);
  const [email, setEmail] = useState(werte.email);

  return (
    // onSubmit statt action={…}: siehe abschicken() in src/lib/formular.ts
    <form onSubmit={(e) => abschicken(e, aktion)} className="flex flex-col gap-5">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}

      <div className="grid gap-5 sm:grid-cols-2">
        <Feld label="Vorname" htmlFor="vorname">
          <Input id="vorname" name="vorname" required value={vorname}
            onChange={(e) => setVorname(e.target.value)} className="h-12 text-base" />
        </Feld>
        <Feld label="Nachname" htmlFor="nachname">
          <Input id="nachname" name="nachname" value={nachname}
            onChange={(e) => setNachname(e.target.value)} className="h-12 text-base" />
        </Feld>
      </div>

      <Feld
        label="Rolle"
        htmlFor="rolle"
        hinweis={
          istSelbst
            ? "Deine eigene Rolle kannst du nicht ändern. Das muss ein anderer Admin machen."
            : ROLLEN_BESCHREIBUNG
        }
      >
        <Auswahl id="rolle" name={istSelbst ? undefined : "rolle"} value={rolle}
          disabled={istSelbst} onChange={(e) => setRolle(e.target.value)}>
          <option value="mitarbeiter">Mitarbeiter</option>
          <option value="buero">Büro</option>
          <option value="admin">Admin</option>
        </Auswahl>
        {/* Deaktivierte Felder werden nicht mitgeschickt → Rolle unverändert mitsenden */}
        {istSelbst && <input type="hidden" name="rolle" value={werte.rolle} />}
      </Feld>

      <div className="grid gap-5 sm:grid-cols-2">
        <Feld label="Telefon (optional)" htmlFor="telefon">
          <Input id="telefon" name="telefon" type="tel" value={telefon}
            onChange={(e) => setTelefon(e.target.value)} className="h-12 text-base" />
        </Feld>
        <Feld label="E-Mail (optional)" htmlFor="email" hinweis="Nur als Kontakt, nicht zum Anmelden.">
          <Input id="email" name="email" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" />
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
