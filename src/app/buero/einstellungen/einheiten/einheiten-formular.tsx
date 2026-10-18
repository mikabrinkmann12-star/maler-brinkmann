"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MAX_EINHEIT_LAENGE, STANDARD_EINHEITEN, type EinheitenEinstellungen } from "@/lib/einheiten";
import { einheitenSpeichern } from "./actions";

const EINGABE = "h-8 rounded-md border border-border bg-white px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

/** Einheiten wie in Plancraft: Liste als Chips mit „×“, neue Einheit hinzufügen, Vorauswahl für neue Positionen und neues Material. */
export function EinheitenFormular({ start }: { start: EinheitenEinstellungen }) {
  const router = useRouter();
  const [liste, setListe] = useState(start.liste);
  const [position, setPosition] = useState(start.position);
  const [material, setMaterial] = useState(start.material);
  const [neu, setNeu] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function hinzufuegen() {
    const t = neu.trim();
    if (!t) return;
    if (liste.some((e) => e.toLowerCase() === t.toLowerCase())) return setFehler(`„${t}“ gibt es schon.`);
    setListe((alt) => [...alt, t]);
    setNeu("");
    setFehler(null);
  }

  function entfernen(e: string) {
    setListe((alt) => alt.filter((x) => x !== e));
    if (position === e) setPosition("");
    if (material === e) setMaterial("");
    setFehler(null);
  }

  function speichern() {
    setFehler(null);
    starte(async () => {
      const r = await einheitenSpeichern({ liste, position, material });
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Einheiten gespeichert.");
      router.refresh();
    });
  }

  const auswahl = (wert: string, aendern: (v: string) => void, label: string) => (
    <label className="flex items-center gap-3 text-[13px]">
      <span className="w-44">{label}</span>
      <select value={wert} onChange={(e) => { aendern(e.target.value); setFehler(null); }} className={`${EINGABE} w-32`}>
        {wert === "" && <option value="">– wählen –</option>}
        {liste.map((e) => <option key={e} value={e}>{e}</option>)}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold">Einheiten</h2>
        <ul className="flex flex-wrap gap-1.5">
          {liste.map((e) => (
            <li key={e} className="flex items-center gap-1 rounded-full border bg-white py-0.5 pr-1 pl-2.5 text-[13px]">
              {e}
              <button type="button" aria-label={`${e} entfernen`} onClick={() => entfernen(e)} className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive">
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); hinzufuegen(); }} className="flex items-center gap-2">
          <input aria-label="Neue Einheit" value={neu} onChange={(e) => { setNeu(e.target.value); setFehler(null); }} maxLength={MAX_EINHEIT_LAENGE} placeholder="Neue Einheit, z. B. Std" className={`${EINGABE} w-48`} />
          <Button type="submit" variant="outline" className="h-8 px-3 text-[13px]" disabled={!neu.trim()}><PlusIcon className="size-3.5" /> Hinzufügen</Button>
        </form>
        <p className="text-xs text-muted-foreground">Die Liste erscheint als Vorschlag, wenn du eine Einheit eintippst. Auch eine Einheit, die nicht in der Liste steht, ist möglich. Schon vergebene Einheiten in Leistungen und Angeboten bleiben unverändert.</p>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold">Vorauswahl</h2>
        {auswahl(position, setPosition, "Neue Position / Leistung")}
        {auswahl(material, setMaterial, "Neues Material")}
      </section>

      {fehler && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{fehler}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" className="h-8 px-3 text-[13px]" disabled={laeuft} onClick={speichern}>{laeuft ? "Speichern …" : "Speichern"}</Button>
        <Button type="button" variant="ghost" className="h-8 px-3 text-[13px]" disabled={laeuft} onClick={() => { setListe(STANDARD_EINHEITEN.liste); setPosition(STANDARD_EINHEITEN.position); setMaterial(STANDARD_EINHEITEN.material); setFehler(null); }}>
          Standardliste einsetzen
        </Button>
      </div>
    </div>
  );
}
