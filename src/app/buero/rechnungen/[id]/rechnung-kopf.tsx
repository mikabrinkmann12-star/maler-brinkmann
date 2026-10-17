"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { rechnungKopfSchema } from "@/lib/rechnung-schema";
import type { RechnungKopfStart } from "@/lib/rechnung-formular";
import { rechnungKopfSpeichern } from "../actions";

/** Kopfdaten der Rechnung: Betreff, Datum, Leistungszeitraum, Zahlungsbedingungen, Steuer, Rabatt, Texte. */
export function RechnungKopf({ rechnungId, start, gesperrt }: { rechnungId: string; start: RechnungKopfStart; gesperrt: boolean }) {
  const router = useRouter();
  const [w, setW] = useState<RechnungKopfStart>(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [laeuft, starte] = useTransition();
  const geaendert = (Object.keys(start) as (keyof RechnungKopfStart)[]).some((k) => start[k] !== w[k]);

  const f = (name: keyof RechnungKopfStart) => ({
    value: w[name],
    disabled: gesperrt,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setW((alt) => ({ ...alt, [name]: e.target.value }));
      setFehler(null);
      setGespeichert(false);
    },
  });

  function speichern(e: React.FormEvent) {
    e.preventDefault();
    const pruefung = rechnungKopfSchema.safeParse(w);
    if (!pruefung.success) return setFehler(ersteMeldung(pruefung.error));
    setFehler(null);
    starte(async () => {
      const r = await rechnungKopfSpeichern(rechnungId, w);
      if (r.fehler) return setFehler(r.fehler);
      setGespeichert(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={speichern} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Rechnungsdaten</h2>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <Feld label="Betreff" htmlFor="r-betreff">
        <Input id="r-betreff" maxLength={200} className="h-11 text-base" {...f("betreff")} />
      </Feld>
      <div className="grid gap-4 sm:grid-cols-3">
        <Feld label="Rechnungsdatum" htmlFor="r-datum"><Input id="r-datum" type="date" className="h-11 text-base" {...f("rechnungsdatum")} /></Feld>
        <Feld label="Leistung von" htmlFor="r-von"><Input id="r-von" type="date" className="h-11 text-base" {...f("leistungVon")} /></Feld>
        <Feld label="Leistung bis" htmlFor="r-bis"><Input id="r-bis" type="date" className="h-11 text-base" {...f("leistungBis")} /></Feld>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Feld label="Zahlungsziel (Tage)" htmlFor="r-ziel"><Input id="r-ziel" inputMode="numeric" className="h-11 text-base" {...f("zahlungsziel")} /></Feld>
        <Feld label="Skonto in %" htmlFor="r-skonto" hinweis="Leer = kein Skonto."><Input id="r-skonto" inputMode="decimal" className="h-11 text-base" {...f("skontoProzent")} /></Feld>
        <Feld label="Skonto-Frist (Tage)" htmlFor="r-skonto-tage"><Input id="r-skonto-tage" inputMode="numeric" className="h-11 text-base" {...f("skontoTage")} /></Feld>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label="Umsatzsteuer" htmlFor="r-steuer">
          <Auswahl id="r-steuer" {...f("steuer")}>
            <option value="19">19 %</option>
            <option value="7">7 %</option>
            <option value="0">0 % (ohne Hinweis)</option>
            <option value="rc">Reverse-Charge (§ 13b UStG)</option>
          </Auswahl>
        </Feld>
        <Feld label="Rabatt in %" htmlFor="r-rabatt" hinweis="Auf die Netto-Summe. Leer = kein Rabatt."><Input id="r-rabatt" inputMode="decimal" className="h-11 text-base" {...f("rabatt")} /></Feld>
      </div>
      <Feld label="Anfangstext" htmlFor="r-einleitung" hinweis="Leer = Lexware nimmt seinen eigenen Standardtext.">
        <Textarea id="r-einleitung" rows={3} maxLength={3000} {...f("einleitung")} />
      </Feld>
      <Feld label="Schlusstext" htmlFor="r-schluss" hinweis="Leer = Lexware nimmt seinen eigenen Standardtext.">
        <Textarea id="r-schluss" rows={3} maxLength={3000} {...f("schlusstext")} />
      </Feld>
      {!gesperrt && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={laeuft || !geaendert}>{laeuft ? "Speichern …" : "Rechnungsdaten speichern"}</Button>
          {gespeichert && !geaendert && <span role="status" className="flex items-center gap-1 text-sm text-green-700"><CheckIcon className="size-4" /> Gespeichert</span>}
        </div>
      )}
    </form>
  );
}
