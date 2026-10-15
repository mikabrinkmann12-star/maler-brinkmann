"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, RefreshCwIcon } from "lucide-react";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abschicken } from "@/lib/formular";
import { benutzernameVorschlag } from "@/lib/login";
import { startpasswortErzeugen } from "@/lib/passwort";
import { ROLLEN_BESCHREIBUNG } from "@/lib/rollen";
import { nutzerAnlegenAktion, type AnlegenZustand } from "../actions";
import { Zugangsdaten } from "../zugangsdaten";

const START: AnlegenZustand = {};
const LISTE = "/buero/einstellungen/benutzer";

/** Hält einen Formular-Durchlauf; „Weiteren anlegen“ startet einen neuen. */
export function NeuerNutzerBereich({ startPasswort }: { startPasswort: string }) {
  const [durchlauf, setDurchlauf] = useState(0);
  const [passwort, setPasswort] = useState(startPasswort);

  return (
    <NeuerNutzerFormular
      key={durchlauf}
      startPasswort={passwort}
      weiteren={() => {
        setPasswort(startpasswortErzeugen());
        setDurchlauf((d) => d + 1);
      }}
    />
  );
}

function NeuerNutzerFormular({
  startPasswort,
  weiteren,
}: {
  startPasswort: string;
  weiteren: () => void;
}) {
  const [zustand, aktion, laeuft] = useActionState(nutzerAnlegenAktion, START);
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [benutzername, setBenutzername] = useState("");
  const [benutzernameSelbst, setBenutzernameSelbst] = useState(false);
  const [rolle, setRolle] = useState("mitarbeiter");
  const [telefon, setTelefon] = useState("");
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState(startPasswort);

  if (zustand.angelegt) {
    const a = zustand.angelegt;
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <CheckCircle2Icon className="size-7 text-green-600" />
          <p className="text-lg font-medium">{a.name} wurde angelegt.</p>
        </div>
        <p>Gib diese Zugangsdaten an {a.name.split(" ")[0]} weiter:</p>
        <Zugangsdaten benutzername={a.benutzername} passwort={a.passwort} />
        <div className="flex flex-wrap gap-3">
          <Button type="button" size="lg" onClick={weiteren}>
            Weiteren Benutzer anlegen
          </Button>
          <Link href={LISTE} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Zur Liste
          </Link>
        </div>
      </div>
    );
  }

  return (
    // onSubmit statt action={…}: siehe abschicken() in src/lib/formular.ts
    <form onSubmit={(e) => abschicken(e, aktion)} className="flex flex-col gap-5">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}

      <div className="grid gap-5 sm:grid-cols-2">
        <Feld label="Vorname" htmlFor="vorname">
          <Input
            id="vorname"
            name="vorname"
            required
            value={vorname}
            onChange={(e) => {
              setVorname(e.target.value);
              if (!benutzernameSelbst) setBenutzername(benutzernameVorschlag(e.target.value));
            }}
            className="h-12 text-base"
          />
        </Feld>
        <Feld label="Nachname" htmlFor="nachname">
          <Input
            id="nachname"
            name="nachname"
            value={nachname}
            onChange={(e) => setNachname(e.target.value)}
            className="h-12 text-base"
          />
        </Feld>
      </div>

      <Feld
        label="Benutzername"
        htmlFor="benutzername"
        hinweis="Damit meldet sich die Person an. Klein, ohne Umlaute und Leerzeichen. Bei Doppelten z. B. „sebastian.m“."
      >
        <Input
          id="benutzername"
          name="benutzername"
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={benutzername}
          onChange={(e) => {
            setBenutzername(e.target.value.toLowerCase());
            setBenutzernameSelbst(true);
          }}
          className="h-12 font-mono text-base"
        />
      </Feld>

      <Feld label="Rolle" htmlFor="rolle" hinweis={ROLLEN_BESCHREIBUNG}>
        <Auswahl id="rolle" name="rolle" value={rolle} onChange={(e) => setRolle(e.target.value)}>
          <option value="mitarbeiter">Mitarbeiter</option>
          <option value="buero">Büro</option>
          <option value="admin">Admin</option>
        </Auswahl>
      </Feld>

      <div className="grid gap-5 sm:grid-cols-2">
        <Feld label="Telefon (optional)" htmlFor="telefon">
          <Input
            id="telefon"
            name="telefon"
            type="tel"
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
            className="h-12 text-base"
          />
        </Feld>
        <Feld label="E-Mail (optional)" htmlFor="email" hinweis="Nur als Kontakt, nicht zum Anmelden.">
          <Input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 text-base"
          />
        </Feld>
      </div>

      <Feld
        label="Startpasswort"
        htmlFor="passwort"
        hinweis="Wird beim ersten Anmelden durch ein eigenes Passwort ersetzt."
      >
        <div className="flex gap-2">
          <Input
            id="passwort"
            name="passwort"
            required
            minLength={10}
            autoComplete="off"
            spellCheck={false}
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            className="h-12 font-mono text-base"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            aria-label="Neues Passwort erzeugen"
            onClick={() => setPasswort(startpasswortErzeugen())}
          >
            <RefreshCwIcon />
          </Button>
        </div>
      </Feld>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="touch" disabled={laeuft}>
          {laeuft ? "Wird angelegt …" : "Benutzer anlegen"}
        </Button>
        <Link href={LISTE} className={buttonVariants({ variant: "ghost", size: "touch" })}>
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
