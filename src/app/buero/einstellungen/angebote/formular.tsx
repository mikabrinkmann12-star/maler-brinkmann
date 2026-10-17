"use client";

import { useActionState } from "react";
import { CheckIcon } from "lucide-react";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zahlFuerFeld } from "@/lib/angebot";
import type { AngebotEinstellungen } from "@/lib/firma";
import { abschicken } from "@/lib/formular";
import { angebotEinstellungenSpeichern, type AngebotEinstellungenZustand } from "./actions";

const START: AngebotEinstellungenZustand = {};

export function AngebotEinstellungenFormular({ werte }: { werte: AngebotEinstellungen }) {
  const [zustand, aktion, laeuft] = useActionState(angebotEinstellungenSpeichern, START);
  return (
    <form onSubmit={(e) => abschicken(e, aktion)} className="flex flex-col gap-5">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}
      <Feld label="Anfangstext" htmlFor="einleitung" hinweis="Steht über den Positionen. Wird in neue Angebote kopiert und kann dort geändert werden.">
        <Textarea id="einleitung" name="einleitung" defaultValue={werte.einleitung} rows={4} />
      </Feld>
      <Feld label="Schlusstext" htmlFor="schlusstext" hinweis="Steht unter den Summen, vor dem Unterschriftsfeld.">
        <Textarea id="schlusstext" name="schlusstext" defaultValue={werte.schlusstext} rows={5} />
      </Feld>
      <label className="flex items-start gap-3 rounded-xl border p-4">
        <input type="checkbox" name="logo_anzeigen" defaultChecked={werte.logo_anzeigen} className="mt-1 size-5 shrink-0 accent-primary" />
        <span className="flex flex-col gap-1">
          <span className="text-base font-medium">Logo im Briefkopf drucken</span>
          <span className="text-sm text-muted-foreground">
            Ausschalten, wenn ihr bereits bedrucktes Briefpapier mit Logo benutzt: Dann bleibt die Stelle oben links frei. Die Anschrift des Kunden im Fenster steht immer.
            Das Logo selbst lädst du unter Einstellungen → Firmendaten hoch.
          </span>
        </span>
      </label>
      <Feld label="Reverse-Charge-Hinweis" htmlFor="reverse_charge_text" hinweis="Erscheint statt der Umsatzsteuer, wenn im Angebot „Steuerschuldnerschaft des Leistungsempfängers“ gewählt ist (§ 13b UStG).">
        <Textarea id="reverse_charge_text" name="reverse_charge_text" defaultValue={werte.reverse_charge_text} rows={3} />
      </Feld>
      <Feld label="E-Mail-Betreff" htmlFor="mail_betreff" hinweis="Platzhalter: {betreff} (Betreff des Angebots), {kunde}, {firma}.">
        <Input id="mail_betreff" name="mail_betreff" defaultValue={werte.mail_betreff} maxLength={200} className="h-12 text-base" />
      </Feld>
      <Feld label="E-Mail-Text" htmlFor="mail_text" hinweis="Vorlage für den Versand per E-Mail, vor dem Senden änderbar. Das PDF hängt die App selbst an. Platzhalter wie oben.">
        <Textarea id="mail_text" name="mail_text" defaultValue={werte.mail_text} rows={8} />
      </Feld>
      <div className="grid gap-5 sm:grid-cols-2">
        <Feld label="Standard-Umsatzsteuer" htmlFor="standard_steuersatz" hinweis="Gilt, wenn der Kunde keinen eigenen Steuersatz hat. Normalerweise wird der Steuersatz vom Kunden übernommen.">
          <Auswahl id="standard_steuersatz" name="standard_steuersatz" defaultValue={String(werte.standard_steuersatz)}>
            <option value="19">19 %</option>
            <option value="7">7 %</option>
            <option value="0">0 %</option>
          </Auswahl>
        </Feld>
        <Feld label="Angebot gültig (Tage)" htmlFor="gueltigkeit_tage" hinweis="Frist für neue Angebote: Angebotsdatum plus diese Tage ergibt „gültig bis“ (im Angebot änderbar). 0 = keine Gültigkeitsangabe.">
          <Input id="gueltigkeit_tage" name="gueltigkeit_tage" inputMode="numeric" defaultValue={String(werte.gueltigkeit_tage)} className="h-12 max-w-40 text-base" />
        </Feld>
        <Feld label="Standard-Rabatt in %" htmlFor="standard_rabatt" hinweis="Vorgabe für neue Angebote, normalerweise 0.">
          <Input id="standard_rabatt" name="standard_rabatt" defaultValue={zahlFuerFeld(werte.standard_rabatt)} inputMode="decimal" className="h-12 max-w-40 text-base" />
        </Feld>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="touch" disabled={laeuft}>{laeuft ? "Speichern …" : "Speichern"}</Button>
        {zustand.gespeichert && !zustand.fehler && !laeuft && (
          <span role="status" className="flex items-center gap-1 text-sm text-green-700"><CheckIcon className="size-4" /> Gespeichert</span>
        )}
      </div>
    </form>
  );
}
