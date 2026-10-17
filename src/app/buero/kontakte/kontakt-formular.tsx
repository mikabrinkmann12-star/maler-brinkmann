"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { briefanschrift } from "@/lib/kontakt-schema";
import { zahlLesen } from "@/lib/aufmass";
import { kontaktSpeichern, kundennummerVorschlagen } from "./actions";

export type KontaktFormWerte = {
  typ: "privat" | "firma";
  kundennummer: string;
  firmenname: string;
  anrede: string;
  vorname: string;
  nachname: string;
  ansprechpartner: string;
  email: string;
  telefon: string;
  mobil: string;
  website: string;
  strasse: string;
  plz: string;
  ort: string;
  empfaenger: string;
  zahlungsziel_tage: string;
  skonto_prozent: string;
  skonto_tage: string;
  steuersatz: string;
  leitweg_id: string;
  notizen: string;
};

export const LEERES_FORMULAR: KontaktFormWerte = {
  typ: "privat", kundennummer: "", firmenname: "", anrede: "", vorname: "", nachname: "", ansprechpartner: "",
  email: "", telefon: "", mobil: "", website: "", strasse: "", plz: "", ort: "", empfaenger: "",
  zahlungsziel_tage: "", skonto_prozent: "", skonto_tage: "", steuersatz: "19", leitweg_id: "", notizen: "",
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

/** Ganzes Kontaktformular (Anlegen und Bearbeiten), aufgebaut wie das Plancraft-Kontaktformular. */
export function KontaktFormular({ id, start }: { id: string | null; start: KontaktFormWerte }) {
  const router = useRouter();
  const [w, setW] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const f = <K extends keyof KontaktFormWerte>(feld: K) => ({
    value: w[feld],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setW((alt) => ({ ...alt, [feld]: e.target.value })); setFehler(null); },
  });
  const zahl = (t: string) => (t.trim() === "" ? null : zahlLesen(t));
  const vorschau = briefanschrift({ ...w, typ: w.typ });

  function neuVorschlagen() {
    starte(async () => {
      const r = await kundennummerVorschlagen();
      if (r.fehler || !r.nummer) return setFehler(r.fehler ?? "Kein Vorschlag möglich.");
      setW((alt) => ({ ...alt, kundennummer: r.nummer! }));
      setFehler(null);
    });
  }

  function speichern(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    const zz = zahl(w.zahlungsziel_tage), sp = zahl(w.skonto_prozent), st = zahl(w.skonto_tage);
    if ((w.zahlungsziel_tage.trim() && zz === null) || (w.skonto_prozent.trim() && sp === null) || (w.skonto_tage.trim() && st === null)) {
      return setFehler("Bitte bei Zahlungsziel und Skonto nur Zahlen eingeben.");
    }
    starte(async () => {
      const r = await kontaktSpeichern(id, {
        ...w,
        kundennummer: w.kundennummer.trim() || null,
        zahlungsziel_tage: zz, skonto_prozent: sp, skonto_tage: st,
        steuersatz: Number(w.steuersatz),
      });
      if (r.fehler) setFehler(r.fehler);
      else router.push(`/buero/kontakte/${r.id}`);
    });
  }

  const kopf = "h-12 text-base";
  return (
    <form onSubmit={speichern} className="flex max-w-3xl flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      <Abschnitt titel="Allgemein">
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld label="Typ" htmlFor="typ">
            <Auswahl id="typ" {...f("typ")}>
              <option value="privat">Person</option>
              <option value="firma">Firma</option>
            </Auswahl>
          </Feld>
          <Feld label="Kundennummer" htmlFor="kundennummer"
            hinweis="Der Vorschlag zählt weiter (nächste freie Nummer, nie doppelt). Du kannst ihn ändern.">
            <div className="flex gap-2">
              <Input id="kundennummer" {...f("kundennummer")} maxLength={40} className={`${kopf} flex-1`} />
              <Button type="button" variant="outline" size="touch" onClick={neuVorschlagen} disabled={laeuft}>
                Neu vorschlagen
              </Button>
            </div>
          </Feld>
        </div>
        {w.typ === "firma" ? (
          <>
            <Feld label="Firmenname" htmlFor="firmenname"><Input id="firmenname" {...f("firmenname")} maxLength={120} className={kopf} /></Feld>
            <Feld label="Ansprechpartner" htmlFor="ansprechpartner"><Input id="ansprechpartner" {...f("ansprechpartner")} maxLength={120} className={kopf} /></Feld>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Feld label="Anrede" htmlFor="anrede" hinweis="z. B. Herr, Frau, Familie">
              <Input id="anrede" {...f("anrede")} list="anreden" maxLength={100} className={kopf} />
              <datalist id="anreden">{["Herr", "Frau", "Familie", "Eheleute"].map((a) => <option key={a} value={a} />)}</datalist>
            </Feld>
            <Feld label="Vorname" htmlFor="vorname"><Input id="vorname" {...f("vorname")} maxLength={80} className={kopf} /></Feld>
            <Feld label="Nachname" htmlFor="nachname"><Input id="nachname" {...f("nachname")} maxLength={80} className={kopf} /></Feld>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld label="E-Mail" htmlFor="email"><Input id="email" type="email" {...f("email")} className={kopf} /></Feld>
          <Feld label="Webseite" htmlFor="website"><Input id="website" {...f("website")} maxLength={200} className={kopf} /></Feld>
          <Feld label="Telefon" htmlFor="telefon"><Input id="telefon" type="tel" {...f("telefon")} maxLength={40} className={kopf} /></Feld>
          <Feld label="Mobil" htmlFor="mobil"><Input id="mobil" type="tel" {...f("mobil")} maxLength={40} className={kopf} /></Feld>
        </div>
      </Abschnitt>

      <Abschnitt titel="Beschreibung">
        <Feld label="Notizen" htmlFor="notizen">
          <textarea id="notizen" rows={3} maxLength={2000} {...f("notizen")}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </Feld>
      </Abschnitt>

      <Abschnitt titel="Adresse">
        <Feld label="Straße und Hausnummer" htmlFor="strasse"><Input id="strasse" {...f("strasse")} maxLength={120} className={kopf} /></Feld>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Feld label="PLZ" htmlFor="plz"><Input id="plz" {...f("plz")} inputMode="numeric" maxLength={10} className={kopf} /></Feld>
          <Feld label="Ort" htmlFor="ort"><Input id="ort" {...f("ort")} maxLength={80} className={kopf} /></Feld>
        </div>
      </Abschnitt>

      <Abschnitt titel="Empfänger" hinweis="So steht die Anschrift auf Briefen und Angeboten. Leer lassen, dann wird sie aus Anrede, Name und Adresse gebildet.">
        <Feld label="Empfänger von Hand (optional)" htmlFor="empfaenger">
          <textarea id="empfaenger" rows={4} maxLength={400} {...f("empfaenger")}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </Feld>
        <div className="rounded-lg bg-muted p-3 text-sm" aria-label="Vorschau Anschrift">
          {vorschau.length ? vorschau.map((z, i) => <p key={i}>{z}</p>) : <p className="text-muted-foreground">Noch keine Anschrift.</p>}
        </div>
      </Abschnitt>

      <Abschnitt titel="Zahlungsziel & Skonto">
        <div className="grid gap-4 sm:grid-cols-3">
          <Feld label="Zahlungsziel (Tage)" htmlFor="zahlungsziel_tage"><Input id="zahlungsziel_tage" inputMode="numeric" {...f("zahlungsziel_tage")} className={kopf} /></Feld>
          <Feld label="Skonto (%)" htmlFor="skonto_prozent"><Input id="skonto_prozent" inputMode="decimal" {...f("skonto_prozent")} className={kopf} /></Feld>
          <Feld label="Skonto innerhalb (Tage)" htmlFor="skonto_tage"><Input id="skonto_tage" inputMode="numeric" {...f("skonto_tage")} className={kopf} /></Feld>
        </div>
      </Abschnitt>

      <Abschnitt titel="Steuer">
        <Feld label="Steuersatz" htmlFor="steuersatz">
          <Auswahl id="steuersatz" {...f("steuersatz")} className="w-40">
            <option value="19">19 %</option>
            <option value="7">7 %</option>
            <option value="0">0 %</option>
          </Auswahl>
        </Feld>
        <Feld label="Leitweg-ID (nur Behörden)" htmlFor="leitweg_id" hinweis="Behörden und Gemeinden verlangen E-Rechnungen (XRechnung) mit Leitweg-ID, z. B. 04011000-1234512345-35. Bei Privat- und Firmenkunden leer lassen.">
          <Input id="leitweg_id" {...f("leitweg_id")} className={kopf} maxLength={46} />
        </Feld>
      </Abschnitt>

      <div className="flex gap-3">
        <Button type="submit" size="touch" disabled={laeuft}>{laeuft ? "Speichern …" : "Speichern"}</Button>
        <Button type="button" variant="outline" size="touch" onClick={() => router.back()} disabled={laeuft}>Abbrechen</Button>
      </div>
    </form>
  );
}
