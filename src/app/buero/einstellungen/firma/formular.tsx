"use client";

import { useActionState } from "react";
import { CheckIcon } from "lucide-react";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abschicken } from "@/lib/formular";
import type { Firma } from "@/lib/firma";
import { firmaSpeichern, type FirmaZustand } from "./actions";

const START: FirmaZustand = {};

const FELDER: { name: keyof Firma; label: string; hinweis?: string; breit?: boolean; modus?: "tel" | "email" | "url" }[] = [
  { name: "name", label: "Firmenname", hinweis: "Steht im Briefkopf und in der Absenderzeile über dem Empfänger.", breit: true },
  { name: "inhaber", label: "Inhaber", hinweis: "Steht in der Fußzeile, z. B. „Inhaber Ralf Brinkmann“." },
  { name: "strasse", label: "Straße und Hausnummer" },
  { name: "plz", label: "PLZ" },
  { name: "ort", label: "Ort" },
  { name: "telefon", label: "Telefon", modus: "tel" },
  { name: "email", label: "E-Mail", modus: "email" },
  { name: "website", label: "Webseite", modus: "url" },
  { name: "ustid", label: "USt-ID", hinweis: "Steht in der Fußzeile." },
  { name: "steuernummer", label: "Steuernummer", hinweis: "Steht in der Fußzeile." },
  { name: "bank", label: "Bank", hinweis: "z. B. „Raiffeisenbank eG Scharrel“." },
  { name: "iban", label: "IBAN" },
  { name: "bic", label: "BIC" },
];

export function FirmaFormular({ firma }: { firma: Firma }) {
  const [zustand, aktion, laeuft] = useActionState(firmaSpeichern, START);
  return (
    <form onSubmit={(e) => abschicken(e, aktion)} className="flex flex-col gap-5">
      {zustand.fehler && <FormularMeldung>{zustand.fehler}</FormularMeldung>}
      <div className="grid gap-5 sm:grid-cols-2">
        {FELDER.map((f) => (
          <Feld key={f.name} label={f.label} htmlFor={f.name} hinweis={f.hinweis} className={f.breit ? "sm:col-span-2" : undefined}>
            <Input id={f.name} name={f.name} defaultValue={firma[f.name]} inputMode={f.modus} className="h-12 text-base" />
          </Feld>
        ))}
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
