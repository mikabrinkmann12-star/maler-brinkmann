"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { kopfSchema } from "@/lib/angebot-schema";
import { ersteMeldung } from "@/lib/nutzer-schema";
import type { Textvorlage } from "@/lib/textvorlagen";
import { angebotKopfSpeichern } from "../actions";
import { VorlagenAuswahl } from "./vorlagen-auswahl";

type Start = { betreff: string; leistungsort: string; datum: string; empfaenger: string; einleitung: string };

/** Betreff, Datum, Leistungsort, Empfänger und Anfangstext des Angebots. */
export function KopfFormular({ angebotId, start, gesperrt, vorlagen }: { angebotId: string; start: Start; gesperrt: boolean; vorlagen: Textvorlage[] }) {
  const router = useRouter();
  const [w, setW] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [laeuft, starte] = useTransition();
  const geaendert = (Object.keys(start) as (keyof Start)[]).some((k) => start[k] !== w[k]);

  const f = (name: keyof Start) => ({
    value: w[name],
    disabled: gesperrt,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setW((alt) => ({ ...alt, [name]: e.target.value }));
      setFehler(null);
      setGespeichert(false);
    },
  });

  function speichern(e: React.FormEvent) {
    e.preventDefault();
    const pruefung = kopfSchema.safeParse(w);
    if (!pruefung.success) return setFehler(ersteMeldung(pruefung.error));
    setFehler(null);
    starte(async () => {
      const r = await angebotKopfSpeichern(angebotId, pruefung.data);
      if (r.fehler) return setFehler(r.fehler);
      setGespeichert(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={speichern} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Kopf</h2>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Feld label="Betreff" htmlFor="betreff" className="sm:col-span-2">
          <Input id="betreff" maxLength={200} className="h-11 text-base" {...f("betreff")} />
        </Feld>
        <Feld label="Datum" htmlFor="datum">
          <Input id="datum" type="date" className="h-11 text-base" {...f("datum")} />
        </Feld>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label="Empfänger" htmlFor="empfaenger" hinweis="So steht die Anschrift im Briefkopf (eine Zeile pro Zeile).">
          <Textarea id="empfaenger" rows={4} maxLength={500} {...f("empfaenger")} />
        </Feld>
        <Feld label="Leistungsort" htmlFor="leistungsort">
          <Input id="leistungsort" maxLength={300} className="h-11 text-base" {...f("leistungsort")} />
        </Feld>
      </div>
      <Feld label="Anfangstext" htmlFor="einleitung" hinweis="Steht über den Positionen.">
        <VorlagenAuswahl vorlagen={vorlagen} gesperrt={gesperrt} onWahl={(inhalt) => { setW((alt) => ({ ...alt, einleitung: inhalt })); setFehler(null); setGespeichert(false); }} />
        <Textarea id="einleitung" rows={4} maxLength={3000} {...f("einleitung")} />
      </Feld>
      {!gesperrt && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={laeuft || !geaendert}>{laeuft ? "Speichern …" : "Kopf speichern"}</Button>
          {gespeichert && !geaendert && <span role="status" className="flex items-center gap-1 text-sm text-green-700"><CheckIcon className="size-4" /> Gespeichert</span>}
        </div>
      )}
    </form>
  );
}
