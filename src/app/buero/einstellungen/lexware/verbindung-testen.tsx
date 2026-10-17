"use client";

import { useState, useTransition } from "react";
import { PlugZapIcon } from "lucide-react";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { lexwareVerbindungTesten } from "./actions";

export function VerbindungTesten({ eingerichtet }: { eingerichtet: boolean }) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [firma, setFirma] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function testen() {
    setFehler(null);
    setFirma(null);
    starte(async () => {
      const r = await lexwareVerbindungTesten();
      if (r.fehler) return setFehler(r.fehler);
      setFirma(r.firma ?? "");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {firma !== null && <FormularMeldung art="hinweis">Verbindung klappt. Lexware-Konto: <strong>{firma}</strong></FormularMeldung>}
      <div>
        <Button type="button" onClick={testen} disabled={laeuft || !eingerichtet}><PlugZapIcon /> {laeuft ? "Prüft …" : "Verbindung testen"}</Button>
      </div>
    </div>
  );
}
