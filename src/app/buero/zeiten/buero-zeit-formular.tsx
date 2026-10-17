"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatStunden, formatZahl } from "@/lib/format";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { neueId } from "@/lib/warteschlange";
import { stundenEingabeLesen, zeitDatenSchema, type ZeitDaten } from "@/lib/zeit-schema";
import {
  MAX_PAUSE_MIN,
  ZEIT_ARTEN,
  ZEIT_ART_NAMEN,
  arbeitsMinuten,
  brauchtProjekt,
  tagesStandard,
  type ZeitArt,
  type ZeiterfassungEinstellungen,
} from "@/lib/zeiten";
import { bueroZeitAendern, bueroZeitAnlegen, bueroZeitArchivieren } from "./actions";

export type BueroZeitStart = {
  userId: string;
  datum: string;
  art: ZeitArt;
  projektId: string;
  modus: "uhrzeit" | "stunden";
  von: string;
  bis: string;
  pauseMin: number;
  stunden: number;
  beschreibung: string;
};

/** Zeit nachtragen (id leer) oder ändern. Nur Büro/Admin, auf dem PC gedacht. */
export function BueroZeitFormular({
  id,
  start,
  personen,
  projekte,
  einstellungen,
}: {
  /** Vorhandener Eintrag: der Mitarbeiter ist dann fest. */
  id: string | null;
  start: BueroZeitStart;
  personen: { id: string; name: string }[];
  projekte: { id: string; name: string }[];
  einstellungen: ZeiterfassungEinstellungen;
}) {
  const router = useRouter();
  const [userId, setUserId] = useState(start.userId);
  const [datum, setDatum] = useState(start.datum);
  const [art, setArt] = useState<ZeitArt>(start.art);
  const [projektId, setProjektId] = useState(start.projektId);
  const [modus, setModus] = useState(start.modus);
  const [von, setVon] = useState(start.von);
  const [bis, setBis] = useState(start.bis);
  const [pauseMin, setPauseMin] = useState(start.pauseMin);
  const [stundenText, setStundenText] = useState(start.modus === "stunden" ? formatZahl(start.stunden) : "");
  const [beschreibung, setBeschreibung] = useState(start.beschreibung);
  const [zeitGeaendert, setZeitGeaendert] = useState(id !== null);
  const [fehler, setFehler] = useState<string | null>(null);
  // Beim Nachtragen gilt eine ID pro Formular: ein zweiter Klick speichert nichts doppelt.
  const [eintragId] = useState(() => id ?? neueId());
  const [laeuft, starte] = useTransition();

  const stundenWert = stundenEingabeLesen(stundenText);
  const rechnung = modus === "uhrzeit" ? arbeitsMinuten(von, bis, pauseMin) : null;
  const minuten = rechnung
    ? "minuten" in rechnung ? rechnung.minuten : null
    : stundenWert != null ? Math.round(stundenWert * 60) : null;
  const name = personen.find((p) => p.id === userId)?.name ?? "";

  function datumWaehlen(tag: string) {
    setDatum(tag);
    setFehler(null);
    // Standardzeiten des Wochentags (Freitag kürzer) vorschlagen, solange nichts von Hand geändert wurde
    if (!zeitGeaendert && tag) {
      const s = tagesStandard(tag, einstellungen);
      setVon(s.standardBeginn);
      setBis(s.standardEnde);
      setPauseMin(s.standardPauseMin);
    }
  }

  function zeitAendern(setzen: () => void) {
    setzen();
    setZeitGeaendert(true);
    setFehler(null);
  }

  function eingabe(): ZeitDaten {
    return {
      datum,
      projektId: projektId || null,
      art,
      modus,
      von: modus === "uhrzeit" ? von : "",
      bis: modus === "uhrzeit" ? bis : "",
      pauseMin: modus === "uhrzeit" ? pauseMin : 0,
      stunden: modus === "stunden" ? (stundenWert ?? 0) : 0,
      beschreibung,
    };
  }

  function speichern(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    if (laeuft) return;
    const werte = eingabe();
    const pruefung = zeitDatenSchema.safeParse(werte);
    if (!pruefung.success) return setFehler(ersteMeldung(pruefung.error));
    if (!userId) return setFehler("Bitte einen Mitarbeiter wählen.");

    setFehler(null);
    starte(async () => {
      const r = id ? await bueroZeitAendern(id, werte) : await bueroZeitAnlegen({ eintragId, userId, daten: werte });
      if (r.fehler) return setFehler(r.fehler);
      toast.success(id ? "Änderung gespeichert." : `Zeit für ${name} gespeichert.`);
      router.push(`/buero/zeiten?monat=${datum.slice(0, 7)}&person=${userId}`);
    });
  }

  function loeschen() {
    if (!id || laeuft) return;
    if (!window.confirm(`Diesen Eintrag von ${name} wirklich löschen?`)) return;
    starte(async () => {
      const r = await bueroZeitArchivieren(id);
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Eintrag gelöscht.");
      router.push(`/buero/zeiten?monat=${datum.slice(0, 7)}&person=${userId}`);
    });
  }

  return (
    <form onSubmit={speichern} className="flex max-w-2xl flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label="Mitarbeiter" htmlFor="person">
          {id ? (
            <p id="person" className="flex h-12 items-center rounded-lg border bg-muted px-3 text-base">{name}</p>
          ) : (
            <Auswahl id="person" value={userId} required onChange={(e) => { setUserId(e.target.value); setFehler(null); }}>
              <option value="">Bitte wählen …</option>
              {personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Auswahl>
          )}
        </Feld>
        <Feld label="Tag" htmlFor="datum">
          <Input id="datum" type="date" required value={datum} onChange={(e) => datumWaehlen(e.target.value)} className="h-12 text-base" />
        </Feld>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label="Art" htmlFor="art">
          <Auswahl id="art" value={art} onChange={(e) => { setArt(e.target.value as ZeitArt); setFehler(null); }}>
            {ZEIT_ARTEN.map((a) => <option key={a} value={a}>{ZEIT_ART_NAMEN[a]}</option>)}
          </Auswahl>
        </Feld>
        <Feld label={brauchtProjekt(art) ? "Baustelle" : "Baustelle (optional)"} htmlFor="projekt">
          <Auswahl id="projekt" value={projektId} onChange={(e) => { setProjektId(e.target.value); setFehler(null); }}>
            <option value="">{brauchtProjekt(art) ? "Bitte wählen …" : "Keine Baustelle"}</option>
            {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Auswahl>
        </Feld>
      </div>

      <div className="flex flex-col gap-4" role="group" aria-labelledby="zeit-titel">
        <div className="flex items-center justify-between gap-3">
          <p id="zeit-titel" className="text-base font-medium">Zeit</p>
          <div className="grid grid-cols-2 rounded-lg border p-0.5 text-sm" role="group" aria-label="Eingabe als">
            {(["uhrzeit", "stunden"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={modus === m}
                onClick={() => zeitAendern(() => {
                  // Beim Wechsel auf „Nur Stunden“ die schon berechnete Zeit übernehmen
                  if (m === "stunden" && !stundenText && minuten != null) setStundenText(formatZahl(minuten / 60));
                  setModus(m);
                })}
                className={cn("h-10 rounded-md px-3", modus === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {m === "uhrzeit" ? "Von–bis" : "Nur Stunden"}
              </button>
            ))}
          </div>
        </div>

        {modus === "uhrzeit" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Feld label="Von" htmlFor="von">
              <Input id="von" type="time" required value={von} step={300}
                onChange={(e) => zeitAendern(() => setVon(e.target.value))} className="h-12 text-base" />
            </Feld>
            <Feld label="Bis" htmlFor="bis">
              <Input id="bis" type="time" required value={bis} step={300}
                onChange={(e) => zeitAendern(() => setBis(e.target.value))} className="h-12 text-base" />
            </Feld>
            <Feld label="Pause (Minuten)" htmlFor="pause">
              <Input id="pause" type="number" inputMode="numeric" min={0} max={MAX_PAUSE_MIN} step={5} value={String(pauseMin)}
                onChange={(e) => zeitAendern(() => setPauseMin(Math.max(0, Math.round(Number(e.target.value) || 0))))}
                className="h-12 text-base" />
            </Feld>
          </div>
        ) : (
          <Feld label="Stunden" htmlFor="stunden" hinweis="z. B. 8 oder 7,5 oder 7:30">
            <Input id="stunden" inputMode="decimal" required value={stundenText} placeholder="8"
              onChange={(e) => zeitAendern(() => setStundenText(e.target.value))} className="h-12 w-40 text-base" />
          </Feld>
        )}
        {rechnung && "fehler" in rechnung && von && bis && <p className="text-sm text-destructive">{rechnung.fehler}</p>}
      </div>

      <Feld label="Beschreibung (Leistung, Material, …)" htmlFor="beschreibung" hinweis="Optional.">
        <textarea id="beschreibung" rows={2} maxLength={500} value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      </Feld>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={laeuft}>
          {laeuft ? "Speichern …" : id ? "Änderung speichern" : "Zeit speichern"}
        </Button>
        <p className="text-sm text-muted-foreground" role="status">
          {minuten != null ? <strong className="text-foreground">{formatStunden(minuten / 60)}</strong> : "Zeit fehlt"}
        </p>
        {id && (
          <Button type="button" variant="destructive" size="lg" className="ml-auto" onClick={loeschen} disabled={laeuft}>
            <Trash2Icon /> Eintrag löschen
          </Button>
        )}
      </div>
    </form>
  );
}
