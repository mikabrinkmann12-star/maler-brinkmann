"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, FileSpreadsheetIcon } from "lucide-react";
import { cn } from "cn";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  STATUS_TEXT,
  importStatus,
  kontakteAusCsv,
  type ImportStatus,
  type ImportZeile,
} from "@/lib/kontakt-import";
import { kontaktAnzeigename } from "@/lib/kontakt-schema";
import { kontakteImportieren, type ImportErgebnis } from "../actions";

const PAKET = 100;
const STATUS_FARBE: Record<ImportStatus, string> = {
  neu: "bg-green-100 text-green-900",
  vorhanden: "bg-muted text-muted-foreground",
  dublette: "bg-amber-100 text-amber-900",
  doppelt_in_datei: "bg-amber-100 text-amber-900",
  fehler: "bg-red-100 text-red-900",
};

export function ImportAssistent({
  bestehendeNummern,
  bestehendeSchluessel,
  anzahlBestehend,
}: {
  bestehendeNummern: string[];
  bestehendeSchluessel: string[];
  anzahlBestehend: number;
}) {
  const dateiRef = useRef<HTMLInputElement>(null);
  const [dateiname, setDateiname] = useState("");
  const [zeilen, setZeilen] = useState<ImportZeile[] | null>(null);
  const [fehlendeSpalten, setFehlendeSpalten] = useState<string[]>([]);
  const [lesefehler, setLesefehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<ImportStatus | "alle">("alle");
  const [laeuft, setLaeuft] = useState(false);
  const [fortschritt, setFortschritt] = useState(0);
  const [ergebnis, setErgebnis] = useState<ImportErgebnis | null>(null);

  const status = useMemo(
    () => (zeilen ? importStatus(zeilen, { kundennummern: new Set(bestehendeNummern), schluessel: new Set(bestehendeSchluessel) }) : []),
    [zeilen, bestehendeNummern, bestehendeSchluessel],
  );
  const zaehler = useMemo(() => {
    const z: Record<ImportStatus, number> = { neu: 0, vorhanden: 0, dublette: 0, doppelt_in_datei: 0, fehler: 0 };
    for (const s of status) z[s]++;
    return z;
  }, [status]);

  async function dateiGewaehlt(ereignis: React.ChangeEvent<HTMLInputElement>) {
    const datei = ereignis.target.files?.[0];
    setErgebnis(null);
    setLesefehler(null);
    setZeilen(null);
    setFehlendeSpalten([]);
    if (!datei) return;
    setDateiname(datei.name);
    if (datei.size > 5 * 1024 * 1024) return setLesefehler("Die Datei ist zu groß (höchstens 5 MB).");
    const text = await datei.text();
    const r = kontakteAusCsv(text);
    if (r.fehlendeSpalten.length) return setFehlendeSpalten(r.fehlendeSpalten);
    if (!r.zeilen.length) return setLesefehler("In der Datei stehen keine Kontakte.");
    setZeilen(r.zeilen);
  }

  async function importieren() {
    if (!zeilen || laeuft) return;
    const neue = zeilen.filter((_, i) => status[i] === "neu").map((z) => z.entwurf!);
    if (!window.confirm(`${neue.length} neue Kontakte importieren?`)) return;
    setLaeuft(true);
    setFortschritt(0);
    const summe: ImportErgebnis = { importiert: 0, uebersprungen: 0, fehlerhaft: 0 };
    try {
      for (let i = 0; i < neue.length; i += PAKET) {
        const r = await kontakteImportieren(neue.slice(i, i + PAKET));
        if (r.fehler) { summe.fehler = r.fehler; break; }
        summe.importiert += r.importiert;
        summe.uebersprungen += r.uebersprungen;
        summe.fehlerhaft += r.fehlerhaft;
        setFortschritt(Math.min(neue.length, i + PAKET));
      }
    } catch {
      summe.fehler = "Die Verbindung ist abgebrochen. Du kannst den Import gefahrlos nochmal starten, schon importierte Kontakte werden übersprungen.";
    }
    setLaeuft(false);
    setErgebnis(summe);
    setZeilen(null);
    if (dateiRef.current) dateiRef.current.value = "";
  }

  const sichtbar = zeilen ? zeilen.map((z, i) => ({ z, s: status[i] })).filter((x) => filter === "alle" || x.s === filter) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
        <FileSpreadsheetIcon className="size-6 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{dateiname || "Noch keine Datei gewählt"}</p>
          <p className="text-sm text-muted-foreground">Aktuell {anzahlBestehend} Kontakte in der App.</p>
        </div>
        <input ref={dateiRef} type="file" accept=".csv,text/csv" onChange={dateiGewaehlt} className="sr-only" id="csv" />
        <label htmlFor="csv" className={cn(buttonVariants({ size: "lg" }), "cursor-pointer")}>CSV-Datei wählen</label>
      </div>

      {lesefehler && <FormularMeldung>{lesefehler}</FormularMeldung>}
      {fehlendeSpalten.length > 0 && (
        <FormularMeldung>
          Das ist nicht der erwartete Plancraft-Export. Es fehlen die Spalten: {fehlendeSpalten.join(", ")}.
        </FormularMeldung>
      )}

      {ergebnis && (
        <div className="flex flex-col gap-3 rounded-xl border border-green-300 bg-green-50 p-4 text-green-950">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2Icon className="size-5" /> Import beendet</p>
          <p>{ergebnis.importiert} Kontakte importiert, {ergebnis.uebersprungen} übersprungen{ergebnis.fehlerhaft ? `, ${ergebnis.fehlerhaft} fehlerhaft` : ""}.</p>
          {ergebnis.fehler && <FormularMeldung>{ergebnis.fehler}</FormularMeldung>}
          <Link href="/buero/kontakte" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-fit bg-white")}>Zur Kontaktliste</Link>
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
                  <th className="p-2">Zeile</th><th className="p-2">Name</th><th className="p-2">Adresse</th><th className="p-2">Kundennr.</th><th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {sichtbar.slice(0, 300).map(({ z, s }) => (
                  <tr key={z.zeile} className="border-t">
                    <td className="p-2 text-muted-foreground">{z.zeile}</td>
                    <td className="p-2">{z.entwurf ? kontaktAnzeigename(z.entwurf) : "–"}</td>
                    <td className="p-2">{z.entwurf ? [z.entwurf.strasse, [z.entwurf.plz, z.entwurf.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : z.fehler}</td>
                    <td className="p-2">{z.entwurf?.kundennummer ?? "–"}</td>
                    <td className="p-2"><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_FARBE[s])}>{STATUS_TEXT[s]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sichtbar.length > 300 && <p className="p-3 text-sm text-muted-foreground">Es werden die ersten 300 Zeilen gezeigt.</p>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="touch" onClick={importieren} disabled={laeuft || zaehler.neu === 0}>
              {laeuft ? `Importiere … ${fortschritt} von ${zaehler.neu}` : `${zaehler.neu} neue Kontakte importieren`}
            </Button>
            <p className="text-sm text-muted-foreground">
              Übersprungen werden {zeilen.length - zaehler.neu} Zeilen (schon vorhanden, doppelt oder fehlerhaft).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
