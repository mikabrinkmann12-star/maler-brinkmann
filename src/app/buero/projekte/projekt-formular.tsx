"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kundenFinden, projektSpeichern, projektnummerVorschlagen, type KundeTreffer } from "./actions";

export type ProjektFormWerte = {
  projektnummer: string;
  name: string;
  kunde: KundeTreffer | null;
  statusId: string;
  strasse: string;
  plz: string;
  ort: string;
  startDatum: string;
  endDatum: string;
  beschreibung: string;
  bueroAnsprechpartnerId: string;
};

function Abschnitt({ titel, hinweis, children }: { titel: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-xl border p-5">
      <legend className="px-1 text-lg font-semibold">{titel}</legend>
      {hinweis && <p className="-mt-2 text-sm text-muted-foreground">{hinweis}</p>}
      {children}
    </fieldset>
  );
}

/** Projekt anlegen und bearbeiten (Büro/Admin). */
export function ProjektFormular({
  id,
  start,
  status,
  buero,
}: {
  id: string | null;
  start: ProjektFormWerte;
  status: { id: string; name: string }[];
  buero: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [w, setW] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<KundeTreffer[]>([]);

  const f = (feld: keyof Omit<ProjektFormWerte, "kunde">) => ({
    value: w[feld],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setW((alt) => ({ ...alt, [feld]: e.target.value }));
      setFehler(null);
    },
  });

  // Kundensuche mit kurzer Verzögerung (beim Tippen, nicht in einem Effekt)
  const timer = useRef<number | undefined>(undefined);
  const letzteSuche = useRef("");
  function sucheAendern(text: string) {
    setSuche(text);
    window.clearTimeout(timer.current);
    letzteSuche.current = text;
    if (text.trim().length < 2) return setTreffer([]);
    timer.current = window.setTimeout(async () => {
      const r = await kundenFinden(text);
      if (letzteSuche.current === text) setTreffer(r); // nur die neueste Suche zählt
    }, 250);
  }

  function kundeWaehlen(k: KundeTreffer) {
    const adresseLeer = !w.strasse && !w.plz && !w.ort;
    setW((alt) => ({ ...alt, kunde: k, ...(adresseLeer ? { strasse: k.strasse, plz: k.plz, ort: k.ort } : {}) }));
    sucheAendern("");
    setFehler(null);
  }

  function neuVorschlagen() {
    starte(async () => {
      const r = await projektnummerVorschlagen();
      if (r.fehler || !r.nummer) return setFehler(r.fehler ?? "Kein Vorschlag möglich.");
      setW((alt) => ({ ...alt, projektnummer: r.nummer! }));
      setFehler(null);
    });
  }

  function speichern(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    starte(async () => {
      const r = await projektSpeichern(id, {
        projektnummer: w.projektnummer,
        name: w.name,
        contactId: w.kunde?.id ?? null,
        statusId: w.statusId,
        strasse: w.strasse,
        plz: w.plz,
        ort: w.ort,
        startDatum: w.startDatum,
        endDatum: w.endDatum,
        beschreibung: w.beschreibung,
        bueroAnsprechpartnerId: w.bueroAnsprechpartnerId || null,
      });
      if (r.fehler) setFehler(r.fehler);
      else router.push(`/baustellen/${r.id}`);
    });
  }

  const kopf = "h-12 text-base";
  return (
    <form onSubmit={speichern} className="flex max-w-3xl flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      <Abschnitt titel="Allgemein">
        <Feld label="Projektname" htmlFor="name"><Input id="name" {...f("name")} maxLength={120} placeholder="z. B. Malerarbeiten Wohnzimmer" className={kopf} /></Feld>
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld label="Projektnummer" htmlFor="projektnummer" hinweis="Der Vorschlag zählt weiter (nächste freie Nummer, nie doppelt).">
            <div className="flex gap-2">
              <Input id="projektnummer" {...f("projektnummer")} maxLength={40} className={`${kopf} flex-1`} />
              <Button type="button" variant="outline" size="touch" onClick={neuVorschlagen} disabled={laeuft}>Neu vorschlagen</Button>
            </div>
          </Feld>
          <Feld label="Status" htmlFor="status">
            <Auswahl id="status" {...f("statusId")}>
              {status.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Auswahl>
          </Feld>
        </div>
        <Feld label="Beschreibung (optional)" htmlFor="beschreibung">
          <textarea id="beschreibung" rows={3} maxLength={2000} {...f("beschreibung")}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </Feld>
      </Abschnitt>

      <Abschnitt titel="Kunde" hinweis="Name, Ort, Straße oder Kundennummer eintippen. Den Kunden gibt es noch nicht? Zuerst unter Kontakte anlegen.">
        {w.kunde ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3">
            <span>
              <span className="block font-medium">{w.kunde.name}</span>
              <span className="block text-sm text-muted-foreground">{[w.kunde.kundennummer, [w.kunde.strasse, [w.kunde.plz, w.kunde.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
            </span>
            <Button type="button" variant="ghost" size="icon-touch" aria-label="Kunde entfernen" onClick={() => setW((alt) => ({ ...alt, kunde: null }))}><XIcon /></Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Kunde suchen" value={suche} onChange={(e) => sucheAendern(e.target.value)} placeholder="Kunde suchen …" className={`${kopf} pl-9`} />
            </div>
            {treffer.length > 0 && (
              <ul className="flex flex-col divide-y rounded-lg border">
                {treffer.map((k) => (
                  <li key={k.id}>
                    <button type="button" onClick={() => kundeWaehlen(k)} className="flex w-full flex-col px-4 py-2 text-left hover:bg-muted">
                      <span className="font-medium">{k.name}</span>
                      <span className="text-sm text-muted-foreground">{[k.kundennummer, [k.strasse, k.ort].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {suche.trim().length >= 2 && treffer.length === 0 && <p className="text-sm text-muted-foreground">Kein Kunde gefunden.</p>}
          </div>
        )}
      </Abschnitt>

      <Abschnitt titel="Baustelle">
        <Feld label="Straße und Hausnummer" htmlFor="strasse"><Input id="strasse" {...f("strasse")} maxLength={120} className={kopf} /></Feld>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Feld label="PLZ" htmlFor="plz"><Input id="plz" {...f("plz")} inputMode="numeric" maxLength={10} className={kopf} /></Feld>
          <Feld label="Ort" htmlFor="ort"><Input id="ort" {...f("ort")} maxLength={80} className={kopf} /></Feld>
        </div>
        {w.kunde && (w.kunde.strasse || w.kunde.ort) && (
          <Button type="button" variant="outline" size="lg" className="w-fit"
            onClick={() => setW((alt) => ({ ...alt, strasse: w.kunde!.strasse, plz: w.kunde!.plz, ort: w.kunde!.ort }))}>
            Adresse vom Kunden übernehmen
          </Button>
        )}
      </Abschnitt>

      <Abschnitt titel="Zeitraum und Ansprechpartner">
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld label="Beginn (optional)" htmlFor="start"><Input id="start" type="date" {...f("startDatum")} className={kopf} /></Feld>
          <Feld label="Ende (optional)" htmlFor="ende"><Input id="ende" type="date" {...f("endDatum")} className={kopf} /></Feld>
        </div>
        <Feld label="Ansprechpartner im Büro" htmlFor="buero">
          <Auswahl id="buero" {...f("bueroAnsprechpartnerId")}>
            <option value="">– keiner –</option>
            {buero.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Auswahl>
        </Feld>
      </Abschnitt>

      <div className="flex gap-3">
        <Button type="submit" size="touch" disabled={laeuft}>{laeuft ? "Speichern …" : "Speichern"}</Button>
        <Button type="button" variant="outline" size="touch" onClick={() => router.back()} disabled={laeuft}>Abbrechen</Button>
      </div>
    </form>
  );
}
