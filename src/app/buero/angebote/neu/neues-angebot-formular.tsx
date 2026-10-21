"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { neuesAngebotSchema } from "@/lib/angebot-schema";
import { DOKUMENTARTEN, DOKUMENTART_INFO, istDokumentart, type Dokumentart } from "@/lib/dokumentart";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { angebotAnlegen } from "../actions";

/** Neues Angebot: Projekt wählen, Betreff eingeben. Alles andere wird aus Projekt, Kunde und Einstellungen vorbelegt. */
export function NeuesAngebotFormular({
  projekte,
  projektId,
  betreffStart,
  artStart,
}: {
  projekte: { id: string; label: string }[];
  projektId: string;
  betreffStart: string;
  artStart: string;
}) {
  const router = useRouter();
  const [projekt, setProjekt] = useState(projektId);
  const [betreff, setBetreff] = useState(betreffStart);
  const [leistungsort, setLeistungsort] = useState("");
  const [art, setArt] = useState<Dokumentart>(istDokumentart(artStart) ? artStart : "angebot");
  const [nachtrag, setNachtrag] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function abschicken(e: React.FormEvent) {
    e.preventDefault();
    if (!projekt) return setFehler("Bitte ein Projekt wählen.");
    const pruefung = neuesAngebotSchema.safeParse({ betreff, leistungsort, dokumentart: art, nachtrag });
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
      <Feld label="Dokumentart" htmlFor="art" hinweis={DOKUMENTART_INFO[art].hinweis}>
        <Auswahl id="art" value={art} onChange={(e) => setArt(e.target.value as Dokumentart)}>
          {DOKUMENTARTEN.map((a) => <option key={a} value={a}>{DOKUMENTART_INFO[a].name}</option>)}
        </Auswahl>
        <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={nachtrag} onChange={(e) => setNachtrag(e.target.checked)} className="size-4" /> Als Nachtrag</label>
      </Feld>
      <Feld label="Projekt" htmlFor="projekt" hinweis="Das Dokument gehört zu diesem Projekt. Kunde, Adresse und Steuersatz kommen vom Projekt.">
        <Auswahl id="projekt" value={projekt} onChange={(e) => { setProjekt(e.target.value); setFehler(null); }}>
          <option value="">– bitte wählen –</option>
          {projekte.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Auswahl>
      </Feld>
      <Feld label="Betreff" htmlFor="betreff" hinweis="Die Überschrift des Dokuments, z. B. „Technologiepark Etage EG, Haus 2“.">
        <Input id="betreff" value={betreff} maxLength={200} onChange={(e) => { setBetreff(e.target.value); setFehler(null); }} className="h-12 text-base" />
      </Feld>
      <Feld label="Leistungsort (optional)" htmlFor="leistungsort" hinweis="Leer lassen: es wird die Baustellen-Adresse des Projekts genommen.">
        <Input id="leistungsort" value={leistungsort} maxLength={300} onChange={(e) => setLeistungsort(e.target.value)} className="h-12 text-base" />
      </Feld>
      <div>
        <Button type="submit" size="touch" disabled={laeuft}>{laeuft ? "Wird angelegt …" : `${DOKUMENTART_INFO[art].name} anlegen`}</Button>
      </div>
    </form>
  );
}
