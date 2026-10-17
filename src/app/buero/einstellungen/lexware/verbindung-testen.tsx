"use client";

import { useState, useTransition } from "react";
import { PlugZapIcon } from "lucide-react";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { lexwareVerbindungTesten } from "./actions";

const FUNKTIONEN: Record<string, string> = { INVOICING: "Rechnungen", INVOICING_PRO: "Rechnungen Pro", BOOKKEEPING: "Buchhaltung" };

export function VerbindungTesten({ eingerichtet }: { eingerichtet: boolean }) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [konto, setKonto] = useState<{ email: string; funktionen: string[]; kleinunternehmer: boolean | null } | null>(null);
  const [laeuft, starte] = useTransition();

  function testen() {
    setFehler(null);
    setKonto(null);
    starte(async () => {
      const r = await lexwareVerbindungTesten();
      if (r.fehler) return setFehler(r.fehler);
      setKonto(r.konto ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {konto && (
        <FormularMeldung art="hinweis">
          Verbindung klappt.{konto.email && <> Konto angelegt von <strong>{konto.email}</strong>.</>}
          {konto.funktionen.length > 0 && <> Freigeschaltet: {konto.funktionen.map((f) => FUNKTIONEN[f] ?? f).join(", ")}.</>}
          {konto.kleinunternehmer !== null && <> Kleinunternehmer: {konto.kleinunternehmer ? "ja" : "nein"}.</>}
        </FormularMeldung>
      )}
      <div>
        <Button type="button" onClick={testen} disabled={laeuft || !eingerichtet}><PlugZapIcon /> {laeuft ? "Prüft …" : "Verbindung testen"}</Button>
      </div>
    </div>
  );
}
