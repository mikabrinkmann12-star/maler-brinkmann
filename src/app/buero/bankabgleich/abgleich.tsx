"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { FileUpIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { formatBetrag, formatDatum } from "@/lib/format";
import { kontoauszugLesen } from "@/lib/kontoauszug";
import type { Vorschlag } from "@/lib/zahlungsabgleich";
import { zahlungenBuchen, zahlungenVorschlagen } from "./actions";

/** Kontoauszug hochladen → Vorschläge prüfen → angehakte als bezahlt buchen. Die Datei verlässt den Browser nicht. */
export function Abgleich() {
  const [vorschlaege, setVorschlaege] = useState<(Vorschlag & { an: boolean })[] | null>(null);
  const [info, setInfo] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  async function datei(f: File | undefined) {
    if (!f) return;
    setFehler(null);
    setVorschlaege(null);
    const gelesen = kontoauszugLesen(new Uint8Array(await f.arrayBuffer()), f.name);
    if ("fehler" in gelesen) return setFehler(gelesen.fehler);
    starte(async () => {
      const r = await zahlungenVorschlagen(gelesen.umsaetze);
      if (r.fehler) return setFehler(r.fehler);
      const daten = gelesen.umsaetze.map((u) => u.datum).sort();
      setInfo(`${gelesen.umsaetze.length} Umsätze vom ${formatDatum(daten[0])} bis ${formatDatum(daten.at(-1)!)} gelesen, ${r.vorschlaege!.length} ${r.vorschlaege!.length === 1 ? "passt" : "passen"} zu offenen Rechnungen.`);
      setVorschlaege(r.vorschlaege!.map((v) => ({ ...v, an: true })));
    });
  }

  function buchen() {
    if (!vorschlaege) return;
    setFehler(null);
    const liste = vorschlaege.filter((v) => v.an).map((v) => ({ art: v.art, id: v.id, datum: v.datum }));
    starte(async () => {
      const r = await zahlungenBuchen(liste);
      if (r.fehler) return setFehler(r.fehler);
      if (r.gebucht) toast.success(`${r.gebucht} ${r.gebucht === 1 ? "Rechnung" : "Rechnungen"} als bezahlt gebucht.`);
      if (r.fehlerListe?.length) setFehler(r.fehlerListe.join(" "));
      setVorschlaege((alt) => (alt ?? []).filter((v) => !v.an));
    });
  }

  const anzahl = vorschlaege?.filter((v) => v.an).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-white px-6 py-8 text-center hover:bg-muted/40">
        <FileUpIcon className="size-8 text-muted-foreground" />
        <span className="font-medium">{laeuft ? "Wird gelesen …" : "Kontoauszug wählen (CSV oder CAMT/XML)"}</span>
        <span className="text-sm text-muted-foreground">Die Datei bleibt auf deinem Gerät. Nur Datum, Betrag, Name und Verwendungszweck werden abgeglichen.</span>
        <input type="file" accept=".csv,.xml,.txt,text/csv,application/xml,text/xml" className="sr-only" disabled={laeuft} onChange={(e) => { void datei(e.target.files?.[0]); e.target.value = ""; }} />
      </label>

      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {info && <p className="text-sm text-muted-foreground">{info}</p>}

      {vorschlaege && vorschlaege.length === 0 && <p className="rounded-lg border bg-white px-4 py-3 text-sm">Keine passenden offenen Rechnungen gefunden.</p>}
      {vorschlaege && vorschlaege.length > 0 && (
        <>
          <ul className="flex flex-col divide-y rounded-xl border bg-white">
            {vorschlaege.map((v, i) => (
              <li key={`${v.art}-${v.id}`} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <input type="checkbox" checked={v.an} aria-label={`${v.titel} als bezahlt buchen`} className="mt-1 size-5 accent-primary"
                  onChange={(e) => setVorschlaege((alt) => alt!.map((x, n) => (n === i ? { ...x, an: e.target.checked } : x)))} />
                <div className="min-w-0 flex-1">
                  <Link href={v.art === "ausgang" ? `/buero/rechnungen/${v.id}` : `/buero/eingangsrechnungen/${v.id}`} className="font-medium underline-offset-4 hover:underline">{v.titel}</Link>
                  <p className="text-xs text-muted-foreground">{v.gruende.join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold tabular-nums ${v.betrag < 0 ? "" : "text-green-700"}`}>{formatBetrag(v.betrag)}</p>
                  <p className="text-xs text-muted-foreground">{formatDatum(v.datum)}</p>
                </div>
              </li>
            ))}
          </ul>
          <div>
            <Button type="button" onClick={buchen} disabled={laeuft || anzahl === 0}>
              {anzahl} {anzahl === 1 ? "Rechnung" : "Rechnungen"} als bezahlt buchen
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
