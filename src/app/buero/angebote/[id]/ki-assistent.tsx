"use client";

import { useState, useTransition } from "react";
import { SparklesIcon } from "lucide-react";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { KiPositionVorschlag } from "@/lib/angebot-ki";
import { formatZahl } from "@/lib/format";
import { MAX_KI_BESCHREIBUNG } from "@/lib/ki";
import { kiUebernehmen, kiVorschlagen } from "../ki-actions";

type Zeile = KiPositionVorschlag & { an: boolean; mengeText: string };

/**
 * KI-Assistent für Angebote (Claude über ANTHROPIC_API_KEY): Beschreibung eintippen, Vorschläge prüfen, angehakte übernehmen.
 * Preise kommen beim Übernehmen aus den Stammdaten; die KI speichert nie von selbst. Kostet pro Vorschlag ein paar Cent.
 */
export function KiAssistent({ angebotId }: { angebotId: string }) {
  const [text, setText] = useState("");
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [kiHinweis, setKiHinweis] = useState("");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function vorschlagen() {
    setFehler(null);
    setMeldung(null);
    starte(async () => {
      const r = await kiVorschlagen(angebotId, text);
      if (!r.ok) return setFehler(r.fehler);
      setKiHinweis(r.hinweis);
      setZeilen(r.positionen.map((p) => ({ ...p, an: true, mengeText: formatZahl(p.menge) })));
    });
  }

  function uebernehmen() {
    setFehler(null);
    const gewaehlt = zeilen.filter((z) => z.an);
    const positionen: { serviceId: string | null; kurztext: string; menge: number; einheit: string }[] = [];
    for (const z of gewaehlt) {
      const menge = Number(z.mengeText.replace(/\./g, "").replace(",", "."));
      if (!(menge > 0)) return setFehler(`Bitte bei „${z.kurztext}“ eine Menge über 0 eintragen.`);
      positionen.push({ serviceId: z.serviceId, kurztext: z.kurztext, menge, einheit: z.einheit });
    }
    starte(async () => {
      const r = await kiUebernehmen(angebotId, positionen);
      if (r.fehler) return setFehler(r.fehler);
      setMeldung(r.hinweis ?? "Übernommen.");
      setZeilen([]);
      setKiHinweis("");
      setText("");
    });
  }

  const aendern = (i: number, teil: Partial<Zeile>) => setZeilen((alt) => alt.map((z, n) => (n === i ? { ...z, ...teil } : z)));
  const anzahl = zeilen.filter((z) => z.an).length;

  return (
    <section aria-labelledby="ki-titel" className="flex flex-col gap-3 rounded-xl border border-dashed border-primary/60 bg-primary/5 p-4">
      <h2 id="ki-titel" className="flex items-center gap-2 text-lg font-semibold"><SparklesIcon className="size-5" /> KI-Assistent</h2>
      <p className="text-sm text-muted-foreground">
        Beschreibe, was gemacht werden soll, zum Beispiel „Wohnzimmer 25 m² Boden, Wände weiß streichen, Decke neu, Fugen ausbessern“. Die KI schlägt Positionen
        aus deinen Leistungen vor. Du prüfst Mengen und übernimmst, was passt. Preise kommen aus den Stammdaten.
      </p>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {meldung && <FormularMeldung art="hinweis">{meldung}</FormularMeldung>}
      <Textarea aria-label="Beschreibung für die KI" value={text} rows={3} maxLength={MAX_KI_BESCHREIBUNG}
        placeholder="Was soll gemacht werden?" onChange={(e) => { setText(e.target.value); setFehler(null); setMeldung(null); }} />
      <div>
        <Button type="button" variant="secondary" onClick={vorschlagen} disabled={laeuft || !text.trim()}>
          <SparklesIcon /> {laeuft && !zeilen.length ? "KI denkt nach …" : "Positionen vorschlagen"}
        </Button>
      </div>

      {zeilen.length > 0 && (
        <div className="flex flex-col gap-2">
          {kiHinweis && <FormularMeldung art="hinweis">{kiHinweis}</FormularMeldung>}
          <ul className="flex flex-col divide-y rounded-lg border bg-white">
            {zeilen.map((z, i) => (
              <li key={i} className="flex flex-wrap items-start gap-3 p-3">
                <input type="checkbox" checked={z.an} onChange={(e) => aendern(i, { an: e.target.checked })} aria-label={`${z.kurztext} übernehmen`} className="mt-2 size-5 accent-primary" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{z.kurztext}</p>
                  <p className="text-xs text-muted-foreground">
                    {z.serviceId ? "Leistung aus den Stammdaten" : "Freie Position: Preis bitte im Angebot eintragen"}
                    {z.hinweis && ` · ${z.hinweis}`}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span className="sr-only">Menge</span>
                  <Input inputMode="decimal" value={z.mengeText} onChange={(e) => aendern(i, { mengeText: e.target.value })} className="h-10 w-24 text-right" />
                  <span className="w-12 text-muted-foreground">{z.einheit}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={uebernehmen} disabled={laeuft || anzahl === 0}>
              {anzahl} {anzahl === 1 ? "Position" : "Positionen"} übernehmen
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setZeilen([]); setKiHinweis(""); }} disabled={laeuft}>Verwerfen</Button>
          </div>
        </div>
      )}
    </section>
  );
}
