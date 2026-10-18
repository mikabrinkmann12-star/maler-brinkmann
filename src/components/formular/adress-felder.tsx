"use client";

import { useEffect, useRef, useState } from "react";
import { MapPinIcon } from "lucide-react";
import { cn } from "cn";
import { EINGABE, Zeile } from "@/components/formular/zeile";
import { LAENDER, type AdressVorschlag } from "@/lib/adresse";

export type AdressWerte = { strasse: string; plz: string; ort: string; land: string };

/**
 * Adressfelder wie in Plancraft: Beim Tippen der Straße erscheinen darunter Adressvorschläge; ein Tipp darauf füllt Straße mit
 * Hausnummer, PLZ, Stadt und Land (die Stadt ist die Gemeinde, z. B. „Saterland“). Alle Felder bleiben von Hand änderbar.
 * Die Vorschläge holt die App über /api/adresse (Photon/OpenStreetMap, kostenlos); fällt der Dienst aus, tippt man einfach selbst.
 */
export function AdressFelder({ werte, onChange }: { werte: AdressWerte; onChange: (neu: AdressWerte) => void }) {
  const [vorschlaege, setVorschlaege] = useState<AdressVorschlag[]>([]);
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const neuesteSuche = useRef("");
  const wurzel = useRef<HTMLDivElement>(null);

  // Liste schließen, wenn man woanders hinklickt
  useEffect(() => {
    function aussen(e: MouseEvent) {
      if (wurzel.current && !wurzel.current.contains(e.target as Node)) setOffen(false);
    }
    document.addEventListener("mousedown", aussen);
    return () => document.removeEventListener("mousedown", aussen);
  }, []);

  function strasseTippen(text: string) {
    onChange({ ...werte, strasse: text });
    window.clearTimeout(timer.current);
    neuesteSuche.current = text;
    if (text.trim().length < 3) {
      setVorschlaege([]);
      setOffen(false);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        const antwort = await fetch(`/api/adresse?q=${encodeURIComponent(text)}`);
        const liste: AdressVorschlag[] = antwort.ok ? await antwort.json() : [];
        if (neuesteSuche.current !== text) return; // nur die neueste Suche zählt
        setVorschlaege(liste);
        setAktiv(0);
        setOffen(liste.length > 0);
      } catch {
        setVorschlaege([]);
      }
    }, 300);
  }

  async function waehlen(v: AdressVorschlag) {
    setOffen(false);
    setVorschlaege([]);
    neuesteSuche.current = v.strasse; // laufende Suchen verwerfen
    onChange({ strasse: v.strasse, plz: v.plz, ort: v.ort, land: v.land });
    // Ortsteil → Gemeinde (z. B. „Scharrel“ → „Saterland“), wenn die Abfrage klappt
    if (v.breite != null && v.laenge != null) {
      try {
        const r = await fetch(`/api/adresse?breite=${v.breite}&laenge=${v.laenge}`);
        const { ort } = (await r.json()) as { ort?: string };
        if (ort && ort !== v.ort) onChange({ strasse: v.strasse, plz: v.plz, ort, land: v.land });
      } catch {
        // bleibt beim Ort aus dem Vorschlag
      }
    }
  }

  function taste(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!offen || vorschlaege.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAktiv((a) => (a + 1) % vorschlaege.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAktiv((a) => (a - 1 + vorschlaege.length) % vorschlaege.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      void waehlen(vorschlaege[aktiv]);
    } else if (e.key === "Escape") {
      setOffen(false);
    }
  }

  const laender: string[] = [...LAENDER];
  if (werte.land && !laender.includes(werte.land)) laender.push(werte.land);

  return (
    <>
      <Zeile label="Straße & Nr." htmlFor="strasse">
        <div ref={wurzel} className="relative">
          <input
            id="strasse"
            value={werte.strasse}
            onChange={(e) => strasseTippen(e.target.value)}
            onKeyDown={taste}
            onFocus={() => vorschlaege.length > 0 && setOffen(true)}
            maxLength={120}
            placeholder="Straße & Nr."
            autoComplete="off"
            role="combobox"
            aria-expanded={offen}
            aria-autocomplete="list"
            className={EINGABE}
          />
          {offen && (
            <ul role="listbox" className="absolute top-full left-0 z-40 mt-1 w-[min(26rem,90vw)] overflow-hidden rounded-md border bg-popover p-1 shadow-lg">
              {vorschlaege.map((v, i) => (
                <li key={v.label} role="option" aria-selected={i === aktiv}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void waehlen(v)}
                    className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-muted", i === aktiv && "bg-muted")}
                  >
                    <MapPinIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{v.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Zeile>
      <Zeile label="PLZ" htmlFor="plz">
        <input id="plz" value={werte.plz} onChange={(e) => onChange({ ...werte, plz: e.target.value })} inputMode="numeric" maxLength={10} placeholder="PLZ" className={EINGABE} />
      </Zeile>
      <Zeile label="Stadt" htmlFor="ort">
        <input id="ort" value={werte.ort} onChange={(e) => onChange({ ...werte, ort: e.target.value })} maxLength={80} placeholder="Stadt" className={EINGABE} />
      </Zeile>
      <Zeile label="Land" htmlFor="land">
        <select id="land" value={werte.land} onChange={(e) => onChange({ ...werte, land: e.target.value })} className={EINGABE}>
          {laender.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Zeile>
    </>
  );
}
