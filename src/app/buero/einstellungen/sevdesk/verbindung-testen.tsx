"use client";

import { useState, useTransition } from "react";
import { PlugZapIcon } from "lucide-react";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { sevdeskVerbindungTesten, type SevdeskTest } from "./actions";

export function SevdeskVerbindungTesten({ eingerichtet }: { eingerichtet: boolean }) {
  const [ergebnis, setErgebnis] = useState<SevdeskTest | null>(null);
  const [laeuft, starte] = useTransition();

  function testen() {
    setErgebnis(null);
    starte(async () => setErgebnis(await sevdeskVerbindungTesten()));
  }

  const konto = ergebnis?.konto;
  return (
    <div className="flex flex-col gap-3">
      {ergebnis?.fehler && <FormularMeldung>{ergebnis.fehler}</FormularMeldung>}
      {konto && konto.version === "2.0" && (
        <FormularMeldung art="hinweis">
          Verbindung klappt. Buchführungssystem 2.0.
          {konto.benutzer && <> Rechnungen laufen auf den Benutzer <strong>{konto.benutzer}</strong>.</>}
          {konto.kassen === 0 ? " Achtung: Es ist noch kein Konto/keine Kasse für Zahlungen angelegt." : ` ${konto.kassen} Konto/Konten für Zahlungen.`}
        </FormularMeldung>
      )}
      {konto && konto.version !== "2.0" && (
        <FormularMeldung>
          Dieses sevdesk-Konto nutzt noch das alte Buchführungssystem (Version „{konto.version || "unbekannt"}“). Die App braucht Version 2.0, bitte in sevdesk auf das neue System umstellen.
        </FormularMeldung>
      )}
      <div>
        <Button type="button" onClick={testen} disabled={laeuft || !eingerichtet}><PlugZapIcon /> {laeuft ? "Prüft …" : "Verbindung testen"}</Button>
      </div>
    </div>
  );
}
