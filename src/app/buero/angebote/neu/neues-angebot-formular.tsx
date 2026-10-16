"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { neuesAngebotSchema } from "@/lib/angebot-schema";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { angebotAnlegen } from "../actions";

/** Neues Angebot: Projekt wählen, Betreff eingeben. Alles andere wird aus Projekt, Kunde und Einstellungen vorbelegt. */
export function NeuesAngebotFormular({
  projekte,
  projektId,
  betreffStart,
}: {
  projekte: { id: string; label: string }[];
  projektId: string;
  betreffStart: string;
}) {
  const router = useRouter();
  const [projekt, setProjekt] = useState(projektId);
  const [betreff, setBetreff] = useState(betreffStart);
  const [leistungsort, setLeistungsort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function abschicken(e: React.FormEvent) {
    e.preventDefault();
    if (!projekt) return setFehler("Bitte ein Projekt wählen.");
    const pruefung = neuesAngebotSchema.safeParse({ betreff, leistungsort });
    if (!pruefung.success) return setFehler(ersteMeldung(pruefung.error));
    setFehler(null);
    starte(async () => {
      const r = await angebotAnlegen(projekt, pruefung.data);
      if (r.fehler || !r.id) return setFehler(r.fehler ?? "Das hat nicht geklappt.");
      router.push(`/buero/angebote/${r.id}`);
    });
  }

  return (
    <form onSubmit={abschicken} className="flex max-w-2xl flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <Feld label="Projekt" htmlFor="projekt" hinweis="Das Angebot gehört zu diesem Projekt. Kunde, Adresse und Steuersatz kommen vom Projekt.">
        <Auswahl id="projekt" value={projekt} onChange={(e) => { setProjekt(e.target.value); setFehler(null); }}>
          <option value="">– bitte wählen –</option>
          {projekte.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Auswahl>
      </Feld>
      <Feld label="Betreff" htmlFor="betreff" hinweis="Die Überschrift des Angebots, z. B. „Technologiepark Etage EG, Haus 2“.">
        <Input id="betreff" value={betreff} maxLength={200} onChange={(e) => { setBetreff(e.target.value); setFehler(null); }} className="h-12 text-base" />
      </Feld>
      <Feld label="Leistungsort (optional)" htmlFor="leistungsort" hinweis="Leer lassen: es wird die Baustellen-Adresse des Projekts genommen.">
        <Input id="leistungsort" value={leistungsort} maxLength={300} onChange={(e) => setLeistungsort(e.target.value)} className="h-12 text-base" />
      </Feld>
      <div>
        <Button type="submit" size="touch" disabled={laeuft}>{laeuft ? "Angebot wird angelegt …" : "Angebot anlegen"}</Button>
      </div>
    </form>
  );
}
