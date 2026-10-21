"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBetrag, formatDatum } from "@/lib/format";
import { KOSTENART_NAMEN, type Kostenart } from "@/lib/kalkulation";
import { neueId } from "@/lib/warteschlange";
import { eingangsrechnungKostenart, kostenArchivieren, kostenErfassen } from "./actions";

const ARTEN: Exclude<Kostenart, "lohn">[] = ["material", "geraete", "fremdleistung", "sonstiges"];
const feld = "h-9 rounded-md border bg-white px-2 text-sm";

/** „Kosten erfassen“ mit Liste der erfassten Kosten (Entfernen = archivieren) und die zugewiesenen Eingangsrechnungen mit Kostenart. */
export function KostenBereich({
  projektId,
  heute,
  kosten,
  eingangsrechnungen,
  darfErfassen,
}: {
  projektId: string;
  heute: string;
  kosten: { id: string; datum: string; kostenart: string; betrag: number; beschreibung: string }[];
  eingangsrechnungen: { id: string; lieferant: string; rechnungsnummer: string; netto: number; kostenart: string }[];
  darfErfassen: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState(neueId);
  const [datum, setDatum] = useState(heute);
  const [art, setArt] = useState<string>("material");
  const [betrag, setBetrag] = useState("");
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function speichern() {
    setFehler(null);
    starte(async () => {
      const r = await kostenErfassen(projektId, { id, datum, kostenart: art, betrag, beschreibung: text });
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Kosten erfasst.");
      setBetrag("");
      setText("");
      setId(neueId());
      router.refresh();
    });
  }

  function entfernen(kostenId: string) {
    starte(async () => {
      const r = await kostenArchivieren(projektId, kostenId);
      if (r.fehler) toast.error(r.fehler);
      else router.refresh();
    });
  }

  function artWechseln(rechnungId: string, neu: string) {
    starte(async () => {
      const r = await eingangsrechnungKostenart(projektId, rechnungId, neu);
      if (r.fehler) toast.error(r.fehler);
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="flex flex-col gap-3 rounded-lg border bg-white p-4" aria-label="Kosten erfassen">
        <h2 className="text-sm font-semibold">Kosten erfassen</h2>
        {darfErfassen && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs">Datum<Input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="h-9" /></label>
              <label className="flex flex-col gap-1 text-xs">Kostenart
                <select value={art} onChange={(e) => setArt(e.target.value)} className={feld}>{ARTEN.map((a) => <option key={a} value={a}>{KOSTENART_NAMEN[a]}</option>)}</select>
              </label>
              <label className="flex flex-col gap-1 text-xs">Betrag netto (€)<Input inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="120,50" className="h-9" /></label>
              <label className="flex flex-col gap-1 text-xs sm:col-span-1 col-span-2">Beschreibung<Input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} className="h-9" /></label>
            </div>
            {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
            <div><Button type="button" onClick={speichern} disabled={laeuft || !betrag.trim()}><PlusIcon /> Kosten erfassen</Button></div>
          </div>
        )}
        {kosten.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Kosten erfasst. Hier trägst du z. B. Geräte-Miete, Fremdleistungen oder Material ohne Rechnung ein.</p>
        ) : (
          <ul className="divide-y text-sm">
            {kosten.map((k) => (
              <li key={k.id} className="flex items-center gap-3 py-2">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{formatDatum(k.datum)}</span>
                <span className="w-28 shrink-0">{KOSTENART_NAMEN[k.kostenart as Kostenart] ?? k.kostenart}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{k.beschreibung || "–"}</span>
                <span className="tabular-nums font-medium">{formatBetrag(k.betrag)}</span>
                {darfErfassen && (
                  <button type="button" onClick={() => entfernen(k.id)} disabled={laeuft} aria-label="Kosten entfernen" title="Entfernen" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive">
                    <Trash2Icon className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border bg-white p-4" aria-label="Eingangsrechnungen des Projekts">
        <h2 className="text-sm font-semibold">Eingangsrechnungen auf dem Projekt</h2>
        {eingangsrechnungen.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Eingangsrechnung diesem Projekt zugewiesen. Die Zuweisung machst du bei der Eingangsrechnung („Kostenzuweisung“).</p>
        ) : (
          <ul className="divide-y text-sm">
            {eingangsrechnungen.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate">{r.lieferant || "Ohne Lieferant"}{r.rechnungsnummer && <span className="text-muted-foreground"> · {r.rechnungsnummer}</span>}</span>
                <select value={r.kostenart} disabled={laeuft || !darfErfassen} onChange={(e) => artWechseln(r.id, e.target.value)} aria-label="Kostenart" className={feld}>
                  {ARTEN.map((a) => <option key={a} value={a}>{KOSTENART_NAMEN[a]}</option>)}
                </select>
                <span className="w-24 text-right tabular-nums font-medium">{formatBetrag(r.netto)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
