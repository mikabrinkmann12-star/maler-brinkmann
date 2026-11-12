"use client";

import { useActionState } from "react";
import { CheckIcon } from "lucide-react";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abschicken } from "@/lib/formular";
import type { DatevEinstellungen } from "@/lib/steuerberater-export";
import { datevSpeichern, type DatevZustand } from "./actions";

const START: DatevZustand = {};

/** Konten und Nummern für den DATEV-Buchungsstapel (nennt der Steuerberater; SKR03-Standardwerte sind vorbelegt). */
export function DatevFormular({ start, darfAendern }: { start: DatevEinstellungen; darfAendern: boolean }) {
  const [zustand, aktion, laeuft] = useActionState(datevSpeichern, START);
  const eingabe = (name: string, label: string, wert: number, hinweis?: string) => (
    <Feld key={name} label={label} htmlFor={name} hinweis={hinweis}>
      <Input id={name} name={name} defaultValue={String(wert)} inputMode="numeric" disabled={!darfAendern} className="h-11 max-w-44" />
    </Feld>
  );
  return (
    <form onSubmit={(e) => abschicken(e, aktion)} className="flex flex-col gap-4">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}
      <div className="grid gap-4 sm:grid-cols-2">
        {eingabe("berater", "Beraternummer", start.berater, "Nennt der Steuerberater.")}
        {eingabe("mandant", "Mandantennummer", start.mandant, "Nennt der Steuerberater.")}
        {eingabe("debitor", "Sammeldebitor", start.debitor, "Nur für Kunden ohne eigenes Konto. Jeder Kunde hat sonst sein eigenes Konto ab 10000 (steht im Kontakt).")}
        {eingabe("sachkontenlaenge", "Sachkontenlänge", start.sachkontenlaenge, "Meist 4 (SKR03).")}
        {eingabe("erloes19", "Erlöse 19 %", start.erloes19)}
        {eingabe("erloes7", "Erlöse 7 %", start.erloes7)}
        {eingabe("erloes0", "Erlöse 0 %", start.erloes0)}
        {eingabe("erloes_reverse_charge", "Erlöse § 13b (Reverse-Charge)", start.erloesReverseCharge)}
        {eingabe("abschlag19", "Abschlagsrechnungen 19 %", start.abschlag19)}
        {eingabe("abschlag_reverse_charge", "Abschlagsrechnungen § 13b", start.abschlagReverseCharge)}
        {eingabe("schluss", "Schlussrechnungen", start.schluss, "Die Steuerberaterin bucht sie mit den Abschlägen.")}
      </div>
      {darfAendern && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={laeuft}>{laeuft ? "Speichern …" : "Konten speichern"}</Button>
          {zustand.gespeichert && !zustand.fehler && !laeuft && <span role="status" className="flex items-center gap-1 text-sm text-green-700"><CheckIcon className="size-4" /> Gespeichert</span>}
        </div>
      )}
    </form>
  );
}
