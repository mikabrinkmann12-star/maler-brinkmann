"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BueroZeitFormular } from "@/app/buero/zeiten/buero-zeit-formular";
import { neueZeitDatenLaden } from "@/app/buero/zeiten/actions";
import { heuteIso } from "@/lib/datum";
import { tagesStandard, type ZeiterfassungEinstellungen } from "@/lib/zeiten";
import { NEUE_ZEIT_OEFFNEN, type NeueZeitVorgabe } from "./buero-kontext";

type Daten = {
  personen: { id: string; name: string }[];
  projekte: { id: string; name: string }[];
  einstellungen: ZeiterfassungEinstellungen;
};

/**
 * „Neue Zeit“ als Fenster wie in Plancraft (Plus im Menü, Knopf auf der Zeiten-Seite, Schnellaktion in der Suche).
 * Die Daten (Mitarbeiter, Projekte, Standardzeiten) werden beim ersten Öffnen geholt. Nach dem Speichern schließt das Fenster.
 */
export function NeueZeitDialog() {
  const [offen, setOffen] = useState(false);
  const [vorgabe, setVorgabe] = useState<NeueZeitVorgabe>({});
  const [daten, setDaten] = useState<Daten | null>(null);
  const [fehler, setFehler] = useState(false);
  // Jede Öffnung bekommt ein frisches Formular (neue Eintrags-ID, Standardzeiten)
  const [zaehler, setZaehler] = useState(0);

  useEffect(() => {
    const auf = (e: Event) => {
      const d = (e as CustomEvent<NeueZeitVorgabe | undefined>).detail ?? {};
      setVorgabe(d);
      setZaehler((z) => z + 1);
      setOffen(true);
    };
    window.addEventListener(NEUE_ZEIT_OEFFNEN, auf);
    return () => window.removeEventListener(NEUE_ZEIT_OEFFNEN, auf);
  }, []);

  useEffect(() => {
    if (!offen || daten) return;
    let abgebrochen = false;
    neueZeitDatenLaden()
      .then((d) => {
        if (!abgebrochen) setDaten(d);
      })
      .catch(() => {
        if (!abgebrochen) setFehler(true);
      });
    return () => {
      abgebrochen = true;
    };
  }, [offen, daten]);

  const datum = vorgabe.datum ?? heuteIso();
  const standard = daten ? tagesStandard(datum, daten.einstellungen) : null;
  const person = daten && vorgabe.person && daten.personen.some((p) => p.id === vorgabe.person) ? vorgabe.person : "";

  return (
    <Dialog open={offen} onOpenChange={setOffen}>
      <DialogContent className="top-[6%] max-h-[88vh] translate-y-0 overflow-y-auto p-5 sm:max-w-2xl">
        <DialogTitle className="text-base font-semibold">Neue Zeit</DialogTitle>
        <DialogDescription className="text-xs">
          Für jeden Mitarbeiter und jeden Tag, auch nach der Sperrfrist. Der Eintrag wird mit deinem Namen als Ersteller gespeichert.
        </DialogDescription>
        {fehler && <p role="alert" className="text-[13px] text-destructive">Die Daten konnten nicht geladen werden. Bitte Seite neu laden.</p>}
        {!daten && !fehler && <p className="py-6 text-center text-[13px] text-muted-foreground">Lädt …</p>}
        {daten && standard && (
          <BueroZeitFormular
            key={zaehler}
            id={null}
            einstellungen={daten.einstellungen}
            personen={daten.personen}
            projekte={daten.projekte}
            onFertig={() => setOffen(false)}
            start={{
              userId: person,
              datum,
              art: "arbeitszeit",
              projektId: "",
              modus: "uhrzeit",
              von: standard.standardBeginn,
              bis: standard.standardEnde,
              pauseMin: standard.standardPauseMin,
              stunden: 0,
              beschreibung: "",
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
