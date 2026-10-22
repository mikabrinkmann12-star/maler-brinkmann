"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { MicIcon, SparklesIcon, SquareIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  einteilungErkennen,
  type EinteilungsGruppe,
  type ErkennungsErgebnis,
  type ErkennungsFahrzeug,
  type ErkennungsMitarbeiter,
  type ErkennungsProjekt,
} from "@/lib/einteilung-erkennung";
import {
  spracheVerfuegbar,
  spracherkennungErstellen,
  sprachFehlerText,
  type Spracherkennung,
} from "@/lib/sprache";

const keinAbo = () => () => {};

/**
 * Einteilen per Sprache (oder Tippen): Text → Namen-Erkennung → Vorschlag.
 * Gespeichert wird erst über die Karten („Alle speichern“).
 */
export function Spracheingabe({
  daten,
  namen,
  onUebernehmen,
  startText = "",
}: {
  daten: { mitarbeiter: ErkennungsMitarbeiter[]; fahrzeuge: ErkennungsFahrzeug[]; projekte: ErkennungsProjekt[] };
  namen: { fahrzeug: (id: string | null) => string; projekt: (id: string) => string; person: (id: string) => string };
  onUebernehmen: (gruppen: EinteilungsGruppe[]) => void;
  /** Vorbelegter Text (von Jarvis): wird sofort ausgewertet */
  startText?: string;
}) {
  const verfuegbar = useSyncExternalStore(keinAbo, spracheVerfuegbar, () => false);
  const [text, setText] = useState(startText);
  const [zwischentext, setZwischentext] = useState("");
  const [hoert, setHoert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<ErkennungsErgebnis | null>(() => (startText.trim() ? einteilungErkennen(startText, daten) : null));
  const erkennung = useRef<Spracherkennung | null>(null);

  function auswerten(eingabe = text) {
    setErgebnis(einteilungErkennen(eingabe, daten));
  }

  function zuhoerenStarten() {
    const e = spracherkennungErstellen();
    if (!e) return;
    setFehler(null);
    setErgebnis(null);
    let gesammelt = text ? `${text.trim()} ` : "";

    e.onresult = (ereignis) => {
      let vorlaeufig = "";
      for (let i = ereignis.resultIndex; i < ereignis.results.length; i++) {
        const r = ereignis.results[i];
        if (r.isFinal) gesammelt += `${r[0].transcript.trim()} `;
        else vorlaeufig += r[0].transcript;
      }
      setText(gesammelt.trim());
      setZwischentext(vorlaeufig);
    };
    e.onerror = (ereignis) => {
      if (ereignis.error !== "aborted") setFehler(sprachFehlerText(ereignis.error));
    };
    e.onend = () => {
      setHoert(false);
      setZwischentext("");
      if (gesammelt.trim()) auswerten(gesammelt.trim());
    };
    erkennung.current = e;
    e.start();
    setHoert(true);
  }

  function zuhoerenStoppen() {
    erkennung.current?.stop();
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Per Sprache einteilen</h2>
        <p className="text-xs text-muted-foreground">
          Beispiel: „Sebastian und Jan mit Sprinter 1 zu Gerdes, Tobias mit dem Caddy nach Ringstraße“
        </p>
      </div>

      <div className="flex gap-2">
        {verfuegbar && (
          <Button
            type="button"
            size="icon-touch"
            variant={hoert ? "destructive" : "default"}
            onClick={hoert ? zuhoerenStoppen : zuhoerenStarten}
            aria-label={hoert ? "Aufnahme stoppen" : "Sprechen"}
            className={cn(hoert && "animate-pulse")}
          >
            {hoert ? <SquareIcon /> : <MicIcon />}
          </Button>
        )}
        <textarea
          aria-label="Einteilung als Text"
          value={hoert && zwischentext ? `${text} ${zwischentext}`.trim() : text}
          onChange={(e) => setText(e.target.value)}
          placeholder={verfuegbar ? "Mikrofon antippen und sprechen – oder hier tippen" : "Hier tippen (Spracherkennung geht in diesem Browser nicht)"}
          rows={2}
          className="min-h-12 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="button" size="touch" variant="outline" aria-label="Auswerten" onClick={() => auswerten()} disabled={!text.trim() || hoert}>
          <SparklesIcon />
          <span className="hidden sm:inline">Auswerten</span>
        </Button>
      </div>

      {hoert && <p className="text-sm text-muted-foreground">Ich höre zu … zum Beenden das rote Quadrat antippen.</p>}
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      {verfuegbar && (
        <p className="text-xs text-muted-foreground">
          Die Spracherkennung macht der Browser (Chrome: Google, Safari: Apple). Gespeichert wird erst nach deiner Prüfung.
        </p>
      )}

      {ergebnis && (
        <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
          <p className="text-sm font-medium">Vorschlag</p>
          {ergebnis.gruppen.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {ergebnis.gruppen.map((g, i) => (
                <li key={i}>
                  <span className="font-medium">{namen.fahrzeug(g.fahrzeugId)}</span>
                  {" → "}
                  {g.projektId ? namen.projekt(g.projektId) : <span className="text-muted-foreground">Baustelle bleibt</span>}
                  {": "}
                  {g.mitarbeiterIds.length
                    ? g.mitarbeiterIds.map(namen.person).join(", ")
                    : <span className="text-muted-foreground">Leute bleiben</span>}
                </li>
              ))}
            </ul>
          )}
          {ergebnis.hinweise.map((h) => (
            <p key={h} className="text-sm text-amber-800">⚠ {h}</p>
          ))}
          {ergebnis.gruppen.length > 0 && (
            <div className="flex gap-2">
              <Button type="button" size="lg" onClick={() => { onUebernehmen(ergebnis.gruppen); setErgebnis(null); setText(""); }}>
                Übernehmen
              </Button>
              <Button type="button" size="lg" variant="ghost" onClick={() => setErgebnis(null)}>
                Verwerfen
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
