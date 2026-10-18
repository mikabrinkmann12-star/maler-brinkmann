"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, PlusIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { AdressFelder } from "@/components/formular/adress-felder";
import { Abschnitt, EINGABE, Zeile } from "@/components/formular/zeile";
import { Button } from "@/components/ui/button";
import { zahlLesen } from "@/lib/aufmass";
import { KONTAKT_FARBEN } from "@/lib/kontakt-farben";
import type { KontaktFormWerte } from "@/lib/kontakt-formular";
import { briefanschrift } from "@/lib/kontakt-schema";
import { kontaktSpeichern } from "./actions";

type TelefonArt = "arbeit" | "mobil";
type TelefonZeile = { art: TelefonArt; nummer: string };

const PLUS_KNOPF = "mt-1.5 flex items-center gap-1 text-[13px] font-medium text-primary hover:underline";

/**
 * Kontaktformular (Neu und Bearbeiten) im Aufbau von Plancraft (Mika, 18.10.2026): Kopfzeile mit Abbrechen und „Kontakt erstellen“,
 * Abschnitte Allgemein (Typ, Name, Kundennummer mit Vorschlag, E-Mail, Telefon mit Art, Website, Farbe), Beschreibung, Adresse
 * (mit Adressvorschlägen), Empfänger, dazu Zahlungsziel/Skonto und Steuer. Leere Kundennummer = die App vergibt die nächste.
 */
export function KontaktFormular({
  id,
  start,
  vorschlag,
  zurueck,
}: {
  id: string | null;
  start: KontaktFormWerte;
  /** Nummer, die bei leerem Feld vergeben würde (nur beim Anlegen) */
  vorschlag?: string;
  zurueck: string;
}) {
  const router = useRouter();
  const [w, setW] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const [telefone, setTelefone] = useState<TelefonZeile[]>(() => {
    const zeilen: TelefonZeile[] = [];
    if (start.telefon) zeilen.push({ art: "arbeit", nummer: start.telefon });
    if (start.mobil) zeilen.push({ art: "mobil", nummer: start.mobil });
    return zeilen.length ? zeilen : [{ art: "arbeit", nummer: "" }];
  });
  const [websiteOffen, setWebsiteOffen] = useState(Boolean(start.website));

  const f = (feld: keyof KontaktFormWerte) => ({
    value: w[feld],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setW((alt) => ({ ...alt, [feld]: e.target.value }));
      setFehler(null);
    },
  });
  const zahl = (t: string) => (t.trim() === "" ? null : zahlLesen(t));
  const vorschau = briefanschrift(w);
  const istFirma = w.typ === "firma";
  const name = istFirma ? w.firmenname : [w.vorname, w.nachname].filter(Boolean).join(" ");

  function telefonAendern(i: number, teil: Partial<TelefonZeile>) {
    setTelefone((alt) => alt.map((z, j) => (j === i ? { ...z, ...teil } : z)));
    setFehler(null);
  }

  function speichern(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    const zz = zahl(w.zahlungsziel_tage), sp = zahl(w.skonto_prozent), st = zahl(w.skonto_tage);
    if ((w.zahlungsziel_tage.trim() && zz === null) || (w.skonto_prozent.trim() && sp === null) || (w.skonto_tage.trim() && st === null)) {
      return setFehler("Bitte bei Zahlungsziel und Skonto nur Zahlen eingeben.");
    }
    const mitNummer = telefone.filter((z) => z.nummer.trim());
    if (new Set(mitNummer.map((z) => z.art)).size < mitNummer.length) return setFehler("Je Art (Arbeit, Mobil) ist eine Nummer möglich.");
    const nummerVon = (art: TelefonArt) => mitNummer.find((z) => z.art === art)?.nummer.trim() ?? "";
    starte(async () => {
      const r = await kontaktSpeichern(id, {
        ...w,
        telefon: nummerVon("arbeit"),
        mobil: nummerVon("mobil"),
        website: websiteOffen ? w.website : "",
        kundennummer: w.kundennummer.trim() || (id ? null : vorschlag ?? null),
        zahlungsziel_tage: zz, skonto_prozent: sp, skonto_tage: st,
        steuersatz: Number(w.steuersatz),
      });
      if (r.fehler) setFehler(r.fehler);
      else router.push(`/buero/kontakte/${r.id}`);
    });
  }

  return (
    <form onSubmit={speichern} className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href={zurueck} aria-label="Zurück" className="flex size-8 items-center justify-center rounded-md border bg-white hover:bg-muted">
          <ArrowLeftIcon className="size-4" />
        </Link>
        <h1 className="text-[15px] font-semibold">{id ? "Kontakt bearbeiten" : "Neuer Kontakt"}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" className="h-8 px-3 text-[13px]" onClick={() => router.push(zurueck)} disabled={laeuft}>Abbrechen</Button>
          <Button type="submit" className="h-8 px-3 text-[13px]" disabled={laeuft || !name.trim()}>{laeuft ? "Speichern …" : id ? "Speichern" : "Kontakt erstellen"}</Button>
        </div>
      </div>

      {fehler && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{fehler}</p>}

      <Abschnitt titel="Allgemein">
        <Zeile label="Typ" htmlFor="typ">
          <select id="typ" {...f("typ")} className={EINGABE}>
            <option value="privat">Person</option>
            <option value="firma">Firma</option>
          </select>
        </Zeile>
        {istFirma ? (
          <>
            <Zeile label="Firmenname*" htmlFor="firmenname"><input id="firmenname" {...f("firmenname")} maxLength={120} placeholder="Firmenname" className={EINGABE} /></Zeile>
            <Zeile label="Ansprechpartner" htmlFor="ansprechpartner"><input id="ansprechpartner" {...f("ansprechpartner")} maxLength={120} placeholder="Ansprechpartner" className={EINGABE} /></Zeile>
          </>
        ) : (
          <>
            <Zeile label="Name*">
              <div className="grid grid-cols-2 gap-2">
                <input aria-label="Vorname" {...f("vorname")} maxLength={80} placeholder="Vorname" className={EINGABE} />
                <input aria-label="Nachname" {...f("nachname")} maxLength={80} placeholder="Nachname" className={EINGABE} />
              </div>
            </Zeile>
            <Zeile label="Anrede" htmlFor="anrede">
              <input id="anrede" {...f("anrede")} list="anreden" maxLength={100} placeholder="z. B. Herr, Frau, Familie" className={EINGABE} />
              <datalist id="anreden">{["Herr", "Frau", "Familie", "Eheleute"].map((a) => <option key={a} value={a} />)}</datalist>
            </Zeile>
          </>
        )}
        <Zeile
          label="Kundennummer"
          htmlFor="kundennummer"
          hinweis={!id && !w.kundennummer.trim() && vorschlag ? <span className="font-medium text-primary">{vorschlag} wird vergeben</span> : null}
        >
          <input id="kundennummer" {...f("kundennummer")} maxLength={40} placeholder="Kundennummer" className={EINGABE} />
        </Zeile>
        <Zeile label="E-Mail" htmlFor="email">
          <input id="email" type="email" {...f("email")} placeholder="E-Mail" className={EINGABE} />
        </Zeile>
        <Zeile label="Telefon">
          <div className="flex flex-col gap-2">
            {telefone.map((z, i) => (
              <div key={i} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2">
                <select aria-label="Art der Nummer" value={z.art} onChange={(e) => telefonAendern(i, { art: e.target.value as TelefonArt })} className={EINGABE}>
                  <option value="arbeit">Arbeit</option>
                  <option value="mobil">Mobil</option>
                </select>
                <input type="tel" aria-label="Telefonnummer" value={z.nummer} onChange={(e) => telefonAendern(i, { nummer: e.target.value })} maxLength={40} placeholder="Telefon" className={EINGABE} />
                {telefone.length > 1 ? (
                  <button type="button" aria-label="Nummer entfernen" onClick={() => setTelefone((alt) => alt.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
                    <XIcon className="size-4" />
                  </button>
                ) : <span className="size-4" />}
              </div>
            ))}
          </div>
          {telefone.length < 2 && (
            <button type="button" onClick={() => setTelefone((alt) => [...alt, { art: alt[0]?.art === "mobil" ? "arbeit" : "mobil", nummer: "" }])} className={PLUS_KNOPF}>
              <PlusIcon className="size-3.5" /> Telefon hinzufügen
            </button>
          )}
        </Zeile>
        <Zeile label="Website" htmlFor="website">
          {websiteOffen ? (
            <input id="website" {...f("website")} maxLength={200} placeholder="https://" className={EINGABE} />
          ) : (
            <button type="button" onClick={() => setWebsiteOffen(true)} className={cn(PLUS_KNOPF, "mt-1")}>
              <PlusIcon className="size-3.5" /> Website hinzufügen
            </button>
          )}
        </Zeile>
        <Zeile label="Farbe">
          <div className="flex items-center gap-2 pt-1" role="radiogroup" aria-label="Farbe">
            {KONTAKT_FARBEN.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={w.farbe === c.id}
                aria-label={c.name}
                title={c.name}
                onClick={() => setW((alt) => ({ ...alt, farbe: alt.farbe === c.id ? "" : c.id }))}
                className={cn("size-5 rounded-full ring-offset-2 transition", w.farbe === c.id ? "ring-2 ring-foreground" : "hover:scale-110")}
                style={{ backgroundColor: c.wert }}
              />
            ))}
          </div>
        </Zeile>
      </Abschnitt>

      <Abschnitt titel="Beschreibung">
        <Zeile label="Beschreibung" htmlFor="notizen">
          <textarea id="notizen" rows={3} maxLength={2000} {...f("notizen")} placeholder="Beschreibung" className={cn(EINGABE, "h-auto min-h-16 py-1.5")} />
        </Zeile>
      </Abschnitt>

      <Abschnitt titel="Adresse">
        <AdressFelder werte={{ strasse: w.strasse, plz: w.plz, ort: w.ort, land: w.land }} onChange={(a) => { setW((alt) => ({ ...alt, ...a })); setFehler(null); }} />
      </Abschnitt>

      <Abschnitt titel="Empfänger">
        <Zeile
          label="Anschrift von Hand"
          htmlFor="empfaenger"
          hinweis={<span className="text-muted-foreground">Leer lassen, dann wird die Anschrift aus Anrede, Name und Adresse gebildet.</span>}
        >
          <textarea id="empfaenger" rows={4} maxLength={400} {...f("empfaenger")} placeholder="Empfänger" className={cn(EINGABE, "h-auto min-h-20 py-1.5")} />
        </Zeile>
        <Zeile label="Vorschau">
          <div className="rounded-md bg-muted px-3 py-2 text-[13px]" aria-label="Vorschau Anschrift">
            {vorschau.length ? vorschau.map((z, i) => <p key={i}>{z}</p>) : <p className="text-muted-foreground">Noch keine Anschrift.</p>}
          </div>
        </Zeile>
      </Abschnitt>

      <Abschnitt titel="Zahlungsziel & Skonto">
        <Zeile label="Zahlungsziel (Tage)" htmlFor="zahlungsziel_tage"><input id="zahlungsziel_tage" inputMode="numeric" {...f("zahlungsziel_tage")} placeholder="z. B. 14" className={EINGABE} /></Zeile>
        <Zeile label="Skonto (%)" htmlFor="skonto_prozent"><input id="skonto_prozent" inputMode="decimal" {...f("skonto_prozent")} placeholder="z. B. 2" className={EINGABE} /></Zeile>
        <Zeile label="Skonto innerhalb (Tage)" htmlFor="skonto_tage"><input id="skonto_tage" inputMode="numeric" {...f("skonto_tage")} placeholder="z. B. 7" className={EINGABE} /></Zeile>
      </Abschnitt>

      <Abschnitt titel="Steuer">
        <Zeile label="Steuersatz" htmlFor="steuersatz">
          <select id="steuersatz" {...f("steuersatz")} className={EINGABE}>
            <option value="19">19 %</option>
            <option value="7">7 %</option>
            <option value="0">0 % (Reverse-Charge)</option>
          </select>
        </Zeile>
        <Zeile
          label="Leitweg-ID"
          htmlFor="leitweg_id"
          hinweis={<span className="text-muted-foreground">Nur für Behörden und Gemeinden (E-Rechnung), z. B. 04011000-1234512345-35.</span>}
        >
          <input id="leitweg_id" {...f("leitweg_id")} maxLength={46} placeholder="Leitweg-ID" className={EINGABE} />
        </Zeile>
      </Abschnitt>
    </form>
  );
}
