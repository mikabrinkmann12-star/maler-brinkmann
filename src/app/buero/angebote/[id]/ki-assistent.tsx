"use client";

import { useState, useTransition } from "react";
import { SparklesIcon } from "lucide-react";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_KI_BESCHREIBUNG } from "@/lib/ki";
import { kiVorschlagen } from "../ki-actions";

/**
 * KI-Assistent für Angebote: Vorschau. Man kann schon eine Beschreibung eintippen, die KI ist aber noch nicht angeschlossen
 * (Entscheidung von Mika, damit man Ralf zeigen kann, dass es sie geben wird). Es wird nichts gespeichert oder verschickt.
 */
export function KiAssistent({ angebotId }: { angebotId: string }) {
  const [text, setText] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function absenden() {
    setFehler(null);
    setMeldung(null);
    starte(async () => {
      const r = await kiVorschlagen(angebotId, text);
      if ("fehler" in r) return setFehler(r.fehler);
      if (!r.aktiv) return setMeldung(r.meldung);
    });
  }

  return (
    <section aria-labelledby="ki-titel" className="flex flex-col gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ki-titel" className="flex items-center gap-2 text-lg font-semibold"><SparklesIcon className="size-5" /> KI-Assistent</h2>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">Vorschau: noch nicht aktiv</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Beschreibe, was gemacht werden soll, zum Beispiel „Wohnzimmer 25 m² Wände weiß streichen, Decke neu, Fugen ausbessern“. Die KI macht daraus später
        Vorschläge für Positionen aus deinem Katalog. Du prüfst sie und übernimmst, was passt. Sie speichert nie von selbst.
      </p>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {meldung && <FormularMeldung art="hinweis">{meldung}</FormularMeldung>}
      <Textarea aria-label="Beschreibung für die KI" value={text} rows={3} maxLength={MAX_KI_BESCHREIBUNG}
        placeholder="Was soll gemacht werden?" onChange={(e) => { setText(e.target.value); setFehler(null); setMeldung(null); }} />
      <div>
        <Button type="button" variant="secondary" onClick={absenden} disabled={laeuft || !text.trim()}>
          <SparklesIcon /> Positionen vorschlagen
        </Button>
      </div>
    </section>
  );
}
