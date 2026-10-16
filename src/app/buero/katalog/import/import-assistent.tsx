"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, DownloadIcon, FileSpreadsheetIcon } from "lucide-react";
import { cn } from "cn";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatBetrag, formatZahl } from "@/lib/format";
import {
  PFLICHT_SPALTEN,
  STATUS_TEXT,
  VORLAGE_CSV,
  importStatus,
  katalogAusCsv,
  type ImportStatus,
  type ImportZeile,
} from "@/lib/katalog-import";
import { KATALOG_ART_NAMEN, type KatalogArt } from "@/lib/katalog";
import { katalogImportieren, type KatalogImportErgebnis } from "../actions";

const PAKET = 100;
const STATUS_FARBE: Record<ImportStatus, string> = {
  neu: "bg-green-100 text-green-900",
  vorhanden: "bg-muted text-muted-foreground",
  doppelt_in_datei: "bg-amber-100 text-amber-900",
  fehler: "bg-red-100 text-red-900",
};

export function ImportAssistent({ art, bestehendeSchluessel, anzahlBestehend }: { art: KatalogArt; bestehendeSchluessel: string[]; anzahlBestehend: number }) {
  const istMaterial = art === "material";
  const was = KATALOG_ART_NAMEN[art];
  const dateiRef = useRef<HTMLInputElement>(null);
  const [dateiname, setDateiname] = useState("");
  const [zeilen, setZeilen] = useState<ImportZeile[] | null>(null);
  const [fehlendeSpalten, setFehlendeSpalten] = useState<string[]>([]);
  const [lesefehler, setLesefehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<ImportStatus | "alle">("alle");
  const [laeuft, setLaeuft] = useState(false);
  const [fortschritt, setFortschritt] = useState(0);
  const [ergebnis, setErgebnis] = useState<KatalogImportErgebnis | null>(null);

  const status = useMemo(
    () => (zeilen ? importStatus(zeilen, new Set(bestehendeSchluessel)) : []),
    [zeilen, bestehendeSchluessel],
  );
  const zaehler = useMemo(() => {
    const z: Record<ImportStatus, number> = { neu: 0, vorhanden: 0, doppelt_in_datei: 0, fehler: 0 };
    for (const s of status) z[s]++;
    return z;
  }, [status]);
  const neueOrdner = useMemo(() => {
    const pfade = new Set<string>();
    zeilen?.forEach((z, i) => {
      if (status[i] === "neu" && z.entwurf) z.entwurf.ordner.forEach((_, t) => pfade.add(z.entwurf!.ordner.slice(0, t + 1).join(" > ")));
    });
    return pfade.size;
  }, [zeilen, status]);

  async function dateiGewaehlt(ereignis: React.ChangeEvent<HTMLInputElement>) {
    const datei = ereignis.target.files?.[0];
    setErgebnis(null);
    setLesefehler(null);
    setZeilen(null);
    setFehlendeSpalten([]);
    if (!datei) return;
    setDateiname(datei.name);
    if (datei.size > 10 * 1024 * 1024) return setLesefehler("Die Datei ist zu groß (höchstens 10 MB).");
    const r = katalogAusCsv(art, await datei.text());
    if (r.fehlendeSpalten.length) return setFehlendeSpalten(r.fehlendeSpalten);
    if (r.zuViele) return setLesefehler("Die Datei hat mehr als 5.000 Zeilen. Bitte in mehrere Dateien aufteilen.");
    if (!r.zeilen.length) return setLesefehler(`In der Datei stehen keine ${was}.`);
    setZeilen(r.zeilen);
  }

  async function importieren() {
    if (!zeilen || laeuft) return;
    const neue = zeilen.filter((_, i) => status[i] === "neu").map((z) => z.entwurf!);
    if (!window.confirm(`${neue.length} neue ${was} importieren?`)) return;
    setLaeuft(true);
    setFortschritt(0);
    const summe: KatalogImportErgebnis = { importiert: 0, uebersprungen: 0, fehlerhaft: 0, neueOrdner: 0 };
    try {
      for (let i = 0; i < neue.length; i += PAKET) {
        const r = await katalogImportieren(art, neue.slice(i, i + PAKET));
        summe.importiert += r.importiert;
        summe.uebersprungen += r.uebersprungen;
        summe.fehlerhaft += r.fehlerhaft;
        summe.neueOrdner += r.neueOrdner;
        if (r.fehler) { summe.fehler = r.fehler; break; }
        setFortschritt(Math.min(neue.length, i + PAKET));
      }
    } catch {
      summe.fehler = "Die Verbindung ist abgebrochen. Du kannst den Import gefahrlos nochmal starten, schon importierte Einträge werden übersprungen.";
    }
    setLaeuft(false);
    setErgebnis(summe);
    setZeilen(null);
    if (dateiRef.current) dateiRef.current.value = "";
  }

  function vorlageHerunterladen() {
    const url = URL.createObjectURL(new Blob([`﻿${VORLAGE_CSV[art]}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${art === "material" ? "materialien" : "leistungen"}-vorlage.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sichtbar = zeilen ? zeilen.map((z, i) => ({ z, s: status[i] })).filter((x) => filter === "alle" || x.s === filter) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <FileSpreadsheetIcon className="size-6 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{dateiname || "Noch keine Datei gewählt"}</p>
          <p className="text-sm text-muted-foreground">Aktuell {anzahlBestehend} {was} im Katalog.</p>
        </div>
        <Button type="button" variant="outline" size="lg" onClick={vorlageHerunterladen}><DownloadIcon /> Vorlage</Button>
        <input ref={dateiRef} type="file" accept=".csv,text/csv" onChange={dateiGewaehlt} className="sr-only" id="csv" />
        <label htmlFor="csv" className={cn(buttonVariants({ size: "lg" }), "cursor-pointer")}>CSV-Datei wählen</label>
      </div>

      <details className="rounded-xl border p-4 text-sm">
        <summary className="cursor-pointer font-medium">Welche Spalten braucht die Datei?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Pflicht: <strong>{PFLICHT_SPALTEN[art].join(", ")}</strong></li>
          <li>
            Optional: <strong>Ordner</strong> (mit „&gt;“ für Unterordner, z. B. „Farben &gt; Dispersion“; ein „/“ im Namen bleibt erhalten),{" "}
            {istMaterial ? "Artikelnummer, Lieferant, Beschreibung" : "Nummer, Langtext"}, Zuschlag (in %)
          </li>
          <li>Fehlt „Zuschlag“, aber es gibt eine Spalte „Verkaufspreis“, wird der Zuschlag daraus berechnet.</li>
          <li>Preise im deutschen Format (12,50). Trennzeichen Semikolon oder Komma. Die Vorlage oben zeigt das Muster.</li>
          <li>Ein Eintrag gilt als „schon da“, wenn Nummer und Lieferant übereinstimmen, ohne Nummer bei gleichem Namen, gleicher Einheit, gleichem Lieferanten, gleichem Ordner und gleichem Preis.</li>
        </ul>
      </details>

      {lesefehler && <FormularMeldung>{lesefehler}</FormularMeldung>}
      {fehlendeSpalten.length > 0 && (
        <FormularMeldung>
          In der Datei fehlen die Spalten: {fehlendeSpalten.join(", ")}. Bitte die Kopfzeile prüfen (oder die Vorlage benutzen).
        </FormularMeldung>
      )}

      {ergebnis && (
        <div className="flex flex-col gap-3 rounded-xl border border-green-300 bg-green-50 p-4 text-green-950">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2Icon className="size-5" /> Import beendet</p>
          <p>
            {ergebnis.importiert} {was} importiert, {ergebnis.uebersprungen} übersprungen
            {ergebnis.fehlerhaft ? `, ${ergebnis.fehlerhaft} fehlerhaft` : ""}
            {ergebnis.neueOrdner ? `, ${ergebnis.neueOrdner} neue Ordner angelegt` : ""}.
          </p>
          {ergebnis.fehler && <FormularMeldung>{ergebnis.fehler}</FormularMeldung>}
          <Link href="/buero/katalog" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-fit bg-white")}>Zum Katalog</Link>
        </div>
      )}

      {zeilen && (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Vorschau filtern">
            <Button type="button" size="sm" className="h-9 px-4" variant={filter === "alle" ? "default" : "outline"} onClick={() => setFilter("alle")}>
              Alle {zeilen.length}
            </Button>
            {(Object.keys(STATUS_TEXT) as ImportStatus[]).filter((s) => zaehler[s] > 0).map((s) => (
              <Button key={s} type="button" size="sm" className="h-9 px-4" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
                {STATUS_TEXT[s]} {zaehler[s]}
              </Button>
            ))}
          </div>

          <div className="max-h-[28rem] overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left">
                  <th className="p-2">Zeile</th><th className="p-2">Ordner</th><th className="p-2">{istMaterial ? "Artikelnr." : "Nr."}</th><th className="p-2">{istMaterial ? "Bezeichnung" : "Kurztext"}</th>
                  <th className="p-2">Einheit</th><th className="p-2 text-right">{istMaterial ? "EK" : "Kosten"}</th><th className="p-2 text-right">Zuschlag</th><th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {sichtbar.slice(0, 300).map(({ z, s }) => (
                  <tr key={z.zeile} className="border-t align-top">
                    <td className="p-2 text-muted-foreground">{z.zeile}</td>
                    <td className="p-2">{z.entwurf ? z.entwurf.ordner.join(" › ") || "–" : "–"}</td>
                    <td className="p-2">{z.entwurf?.artikelnr || "–"}</td>
                    <td className="p-2">{z.entwurf?.name ?? <span className="text-destructive">{z.fehler}</span>}</td>
                    <td className="p-2">{z.entwurf?.einheit ?? "–"}</td>
                    <td className="p-2 text-right tabular-nums">{z.entwurf ? formatBetrag(z.entwurf.ek) : "–"}</td>
                    <td className="p-2 text-right tabular-nums" title={z.hinweis}>{z.entwurf ? `${formatZahl(z.entwurf.zuschlag)} %${z.hinweis ? " *" : ""}` : "–"}</td>
                    <td className="p-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_FARBE[s])}>{STATUS_TEXT[s]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sichtbar.length > 300 && <p className="p-3 text-sm text-muted-foreground">Es werden die ersten 300 Zeilen gezeigt.</p>}
          </div>
          {zeilen.some((z) => z.hinweis) && (
            <p className="text-sm text-muted-foreground">* Der Zuschlag wurde aus dem Verkaufspreis berechnet (Mauszeiger darüber für Details).</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="touch" onClick={importieren} disabled={laeuft || zaehler.neu === 0}>
              {laeuft ? `Importiere … ${fortschritt} von ${zaehler.neu}` : `${zaehler.neu} neue ${was} importieren`}
            </Button>
            <p className="text-sm text-muted-foreground">
              Übersprungen werden {zeilen.length - zaehler.neu} Zeilen (schon vorhanden, doppelt oder fehlerhaft).
              {neueOrdner > 0 && ` Dabei werden bis zu ${neueOrdner} neue Ordner angelegt.`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
