"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zahlFuerFeld } from "@/lib/angebot";
import { abschlussSchema, type SteuerAuswahl } from "@/lib/angebot-schema";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { angebotAbschlussSpeichern } from "../actions";

type Start = {
  schlusstext: string;
  steuer: SteuerAuswahl;
  rabatt: number;
  zahlungsziel: number | null;
  skontoProzent: number | null;
  skontoTage: number | null;
  gueltigBis: string | null;
};

/** Rabatt, Umsatzsteuer und Schlusstext des Angebots. */
export function AbschlussFormular({ angebotId, start, gesperrt }: { angebotId: string; start: Start; gesperrt: boolean }) {
  const router = useRouter();
  const ausgang = {
    schlusstext: start.schlusstext,
    steuer: start.steuer as string,
    rabatt: start.rabatt === 0 ? "" : zahlFuerFeld(start.rabatt),
    zahlungsziel: start.zahlungsziel == null ? "" : String(start.zahlungsziel),
    skontoProzent: start.skontoProzent == null ? "" : zahlFuerFeld(start.skontoProzent),
    skontoTage: start.skontoTage == null ? "" : String(start.skontoTage),
    gueltigBis: start.gueltigBis ?? "",
  };
  const [w, setW] = useState(ausgang);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [laeuft, starte] = useTransition();
  const geaendert = (Object.keys(ausgang) as (keyof typeof ausgang)[]).some((k) => ausgang[k] !== w[k]);

  const f = (name: keyof typeof ausgang) => ({
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
    const pruefung = abschlussSchema.safeParse(w);
    if (!pruefung.success) return setFehler(ersteMeldung(pruefung.error));
    setFehler(null);
    starte(async () => {
      const r = await angebotAbschlussSpeichern(angebotId, { ...w });
      if (r.fehler) return setFehler(r.fehler);
      setGespeichert(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={speichern} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Abschluss</h2>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label="Umsatzsteuer" htmlFor="steuer" hinweis="Vom Kunden vorbelegt. Bei Reverse-Charge wird keine Umsatzsteuer ausgewiesen, dafür steht der Hinweis aus den Einstellungen im Angebot.">
          <Auswahl id="steuer" {...f("steuer")}>
            <option value="19">19 %</option>
            <option value="7">7 %</option>
            <option value="0">0 % (ohne Hinweis)</option>
            <option value="rc">Reverse-Charge (§ 13b UStG)</option>
          </Auswahl>
        </Feld>
        <Feld label="Rabatt in %" htmlFor="rabatt" hinweis="Auf die Netto-Summe. Leer = kein Rabatt.">
          <Input id="rabatt" inputMode="decimal" placeholder="0" className="h-12 max-w-40 text-base" {...f("rabatt")} />
        </Feld>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Feld label="Zahlungsziel (Tage)" htmlFor="zahlungsziel" hinweis="Leer = keine Angabe im Angebot.">
          <Input id="zahlungsziel" inputMode="numeric" className="h-12 text-base" {...f("zahlungsziel")} />
        </Feld>
        <Feld label="Skonto in %" htmlFor="skonto-prozent" hinweis="Leer = kein Skonto.">
          <Input id="skonto-prozent" inputMode="decimal" className="h-12 text-base" {...f("skontoProzent")} />
        </Feld>
        <Feld label="Skonto-Frist (Tage)" htmlFor="skonto-tage">
          <Input id="skonto-tage" inputMode="numeric" className="h-12 text-base" {...f("skontoTage")} />
        </Feld>
      </div>
      <Feld label="Angebot gültig bis" htmlFor="gueltig-bis" hinweis="Leer = keine Gültigkeitsangabe. Neue Angebote bekommen Angebotsdatum plus die Frist aus den Einstellungen.">
        <Input id="gueltig-bis" type="date" className="h-12 max-w-52 text-base" {...f("gueltigBis")} />
      </Feld>
      <Feld label="Schlusstext" htmlFor="schlusstext" hinweis="Steht unter den Summen, vor dem Unterschriftsfeld.">
        <Textarea id="schlusstext" rows={5} maxLength={3000} {...f("schlusstext")} />
      </Feld>
      {!gesperrt && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={laeuft || !geaendert}>{laeuft ? "Speichern …" : "Abschluss speichern"}</Button>
          {gespeichert && !geaendert && <span role="status" className="flex items-center gap-1 text-sm text-green-700"><CheckIcon className="size-4" /> Gespeichert</span>}
        </div>
      )}
    </form>
  );
}
