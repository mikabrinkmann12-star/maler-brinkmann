"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, FileUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { cn } from "cn";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatBetrag, formatZahl } from "@/lib/format";
import { geschosse, mengeLesen, raumFlaechen, standardPruefen, zeilenMenge } from "@/lib/flaechen";
import {
  FLAECHEN_ART_NAMEN,
  FLAECHEN_EINHEIT,
  FLAECHEN_STANDARD,
  RAUM_ART_NAMEN,
  type Bereich,
  type FlaechenArt,
  type FlaechenStandard,
  type Raum,
  type RaumArt,
} from "@/lib/flaechen-typen";
import { flaechenUebernehmen } from "../../flaechen-actions";
import type { GrundrissAntwort } from "./grundriss/route";

export type LeistungAuswahl = { id: string; name: string; nummer: string; einheit: string; vk: number };

// Maße als Text, damit „12,“ beim Tippen stehen bleibt; gerechnet wird mit mengeLesen()
type RaumEingabe = Omit<Raum, "boden" | "umfang" | "hoehe" | "decke"> & { boden: string; umfang: string; hoehe: string; decke: string };
type ZeileEingabe = { id: string; serviceId: string; flaeche: FlaechenArt; bereich: string };
type StandardEingabe = Record<keyof FlaechenStandard, string>;

const EIN = "h-9 w-full min-w-0 rounded-md border bg-white px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const zahlText = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
const z2 = (n: number) => formatZahl(n, { min: 2, max: 2 });

function alsRaum(e: RaumEingabe): Raum {
  return { ...e, boden: mengeLesen(e.boden), umfang: mengeLesen(e.umfang), hoehe: mengeLesen(e.hoehe), decke: mengeLesen(e.decke) };
}
function alsEingabe(r: Raum): RaumEingabe {
  return { ...r, boden: zahlText(r.boden), umfang: zahlText(r.umfang), hoehe: zahlText(r.hoehe), decke: zahlText(r.decke) };
}
function alsStandard(s: StandardEingabe): FlaechenStandard {
  return standardPruefen(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, mengeLesen(v)])));
}
function alsBereich(wert: string): Bereich {
  if (wert.startsWith("g:")) return { art: "geschoss", geschoss: wert.slice(2) };
  if (wert.startsWith("r:")) return { art: "raeume", ids: [wert.slice(2)] };
  return { art: "alle" };
}
/** Passt die Einheit der Leistung zur Fläche? (nur Hinweis) */
function einheitPasst(einheit: string, flaeche: FlaechenArt): boolean {
  const e = einheit.toLowerCase().replace(/\s/g, "");
  return flaeche === "sockel" ? /^(lfm\.?|m|lfdm\.?|lfd\.m\.?)$/.test(e) : /^(m²|m2|qm)$/.test(e);
}

function leererRaum(geschoss: string): RaumEingabe {
  return { id: crypto.randomUUID(), geschoss, name: "", boden: "", umfang: "", hoehe: "", decke: "", art: "normal", belag: true, sockel: true, geprueft: false, quelle: "hand" };
}

function lesen<T>(schluessel: string): T | null {
  try {
    const t = window.localStorage.getItem(schluessel);
    return t ? (JSON.parse(t) as T) : null;
  } catch {
    return null;
  }
}
function schreiben(schluessel: string, wert: unknown) {
  try {
    window.localStorage.setItem(schluessel, JSON.stringify(wert));
  } catch {
    // Speicher voll oder gesperrt: dann nur ohne Zwischenspeicher
  }
}

function Geschaetzt() {
  return <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-900" title="Geschätzter Wert, bitte prüfen">geschätzt</span>;
}

/**
 * Flächenberechnung: Grundriss reinziehen → Räume prüfen → Leistungen je Bereich wählen → Positionen ins Angebot.
 * Räume und Leistungen bleiben im Browser zwischengespeichert (je Angebot), damit nichts verloren geht. Nur geprüfte Räume zählen.
 */
export function FlaechenRechner({ angebotId, gesperrt, leistungen }: { angebotId: string; gesperrt: boolean; leistungen: LeistungAuswahl[] }) {
  const entwurfSchluessel = `flaechen-entwurf:${angebotId}`;
  const [raeume, setRaeume] = useState<RaumEingabe[]>([]);
  const [zeilen, setZeilen] = useState<ZeileEingabe[]>([]);
  const [stdText, setStdText] = useState<StandardEingabe>(() => ({
    umfangFaktor: zahlText(FLAECHEN_STANDARD.umfangFaktor), raumhoehe: zahlText(FLAECHEN_STANDARD.raumhoehe),
    abzugProzent: zahlText(FLAECHEN_STANDARD.abzugProzent), fliesenhoehe: zahlText(FLAECHEN_STANDARD.fliesenhoehe),
  }));
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [ziehen, setZiehen] = useState(false);
  const [liest, setLiest] = useState(false);
  const [speichert, starte] = useTransition();
  const dateiFeld = useRef<HTMLInputElement>(null);

  // Zwischenspeicher laden (nach dem ersten Zeichnen, weil localStorage nur im Browser da ist)
  useEffect(() => {
    const e = lesen<{ raeume?: RaumEingabe[]; zeilen?: ZeileEingabe[] }>(entwurfSchluessel);
    const s = lesen<Partial<FlaechenStandard>>("flaechen-standard");
    /* eslint-disable react-hooks/set-state-in-effect -- einmaliges Laden aus dem Browser-Speicher */
    if (e?.raeume?.length) setRaeume(e.raeume);
    if (e?.zeilen?.length) setZeilen(e.zeilen);
    if (s) {
      const g = standardPruefen(s);
      setStdText({ umfangFaktor: zahlText(g.umfangFaktor), raumhoehe: zahlText(g.raumhoehe), abzugProzent: zahlText(g.abzugProzent), fliesenhoehe: zahlText(g.fliesenhoehe) });
    }
    setGeladen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [entwurfSchluessel]);
  useEffect(() => {
    if (geladen) schreiben(entwurfSchluessel, { raeume, zeilen });
  }, [geladen, entwurfSchluessel, raeume, zeilen]);

  const std = useMemo(() => alsStandard(stdText), [stdText]);
  useEffect(() => {
    if (geladen) schreiben("flaechen-standard", std);
  }, [geladen, std]);

  const raumListe = useMemo(() => raeume.map(alsRaum), [raeume]);
  const flaechen = useMemo(() => raumListe.map((r) => raumFlaechen(r, std)), [raumListe, std]);
  const geschossListe = useMemo(() => geschosse(raumListe), [raumListe]);
  const ungeprueft = raumListe.filter((r) => !r.geprueft).length;

  const berechnet = zeilen.map((z) => {
    const l = leistungen.find((x) => x.id === z.serviceId);
    if (!l) return { l: null, menge: 0, fehler: "Bitte eine Leistung wählen." };
    const m = zeilenMenge(raumListe, { id: z.id, serviceId: z.serviceId, flaeche: z.flaeche, bereich: alsBereich(z.bereich) }, std);
    return { l, menge: m.menge, fehler: m.fehler };
  });
  const summe = berechnet.reduce((s, b) => s + (b.l && !b.fehler ? b.menge * b.l.vk : 0), 0);
  const allesOk = zeilen.length > 0 && berechnet.every((b) => !b.fehler);

  function raumAendern(id: string, teil: Partial<RaumEingabe>) {
    setHinweis(null);
    setFehler(null);
    // Jede Änderung an einem Raum hebt „geprüft“ auf, außer man hakt gerade ab
    setRaeume((alt) => alt.map((r) => (r.id === id ? { ...r, ...teil, geprueft: "geprueft" in teil ? Boolean(teil.geprueft) : false } : r)));
  }
  function zeileAendern(id: string, teil: Partial<ZeileEingabe>) {
    setHinweis(null);
    setFehler(null);
    setZeilen((alt) => alt.map((z) => (z.id === id ? { ...z, ...teil } : z)));
  }

  async function grundrissLesen(datei: File) {
    setFehler(null);
    setHinweis(null);
    if (datei.type && datei.type !== "application/pdf") return setFehler("Bitte eine PDF-Datei verwenden.");
    if (datei.size > 4_000_000) return setFehler("Die Datei ist zu groß (höchstens 4 MB).");
    setLiest(true);
    try {
      const daten = new FormData();
      daten.set("datei", datei);
      const antwort = await fetch(`/buero/angebote/${angebotId}/flaechen/grundriss`, { method: "POST", body: daten });
      const a = (await antwort.json()) as GrundrissAntwort;
      if (a.fehler) return setFehler(a.fehler);
      const neu = a.raeume ?? [];
      if (neu.length) setRaeume((alt) => [...alt, ...neu.map(alsEingabe)]);
      const wie = a.verfahren === "ki" ? "mit der KI" : "aus dem Text des PDFs";
      if (neu.length) setHinweis(`${neu.length} ${neu.length === 1 ? "Raum" : "Räume"} ${wie} gelesen. Bitte jeden Raum prüfen und abhaken.${a.hinweis ? ` ${a.hinweis}` : ""}`);
      else setFehler(a.hinweis ?? "Im Grundriss wurden keine Räume gefunden. Bitte von Hand eintragen.");
    } catch {
      setFehler("Der Grundriss konnte nicht gelesen werden. Bitte nochmal versuchen.");
    } finally {
      setLiest(false);
      if (dateiFeld.current) dateiFeld.current.value = "";
    }
  }

  function uebernehmen() {
    setFehler(null);
    setHinweis(null);
    starte(async () => {
      const r = await flaechenUebernehmen(angebotId, {
        raeume: raumListe,
        zeilen: zeilen.map((z) => ({ id: z.id, serviceId: z.serviceId, flaeche: z.flaeche, bereich: alsBereich(z.bereich) })),
        standard: std,
      });
      if (r.fehler) return setFehler(r.fehler);
      setZeilen([]); // nicht aus Versehen doppelt übernehmen
      setHinweis(r.hinweis ?? "Übernommen.");
    });
  }

  const STD_FELDER: { k: keyof FlaechenStandard; label: string; einheit: string }[] = [
    { k: "raumhoehe", label: "Raumhöhe", einheit: "m" },
    { k: "abzugProzent", label: "Abzug Türen/Fenster", einheit: "%" },
    { k: "fliesenhoehe", label: "Fliesenhöhe Bad/WC", einheit: "m" },
    { k: "umfangFaktor", label: "Faktor Umfang (× √Boden)", einheit: "" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {hinweis && <FormularMeldung art="hinweis">{hinweis}</FormularMeldung>}

      {/* 1. Grundriss */}
      <section className="flex flex-col gap-3 rounded-xl border p-5" aria-labelledby="grundriss-titel">
        <h2 id="grundriss-titel" className="text-lg font-semibold">1. Grundriss</h2>
        <label
          onDragOver={(e) => { e.preventDefault(); setZiehen(true); }}
          onDragLeave={() => setZiehen(false)}
          onDrop={(e) => {
            e.preventDefault();
            setZiehen(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void grundrissLesen(f);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm text-muted-foreground",
            ziehen && "border-foreground bg-muted",
            liest && "pointer-events-none opacity-60",
          )}
        >
          <FileUpIcon className="size-6" />
          {liest ? "Grundriss wird gelesen …" : "Grundriss (PDF) hierher ziehen oder klicken"}
          <span className="text-xs">Höchstens 4 MB. Es wird nichts gespeichert. Die Räume kommen ungeprüft in die Tabelle.</span>
          <input ref={dateiFeld} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void grundrissLesen(f); }} />
        </label>
      </section>

      {/* Standardwerte */}
      <section className="flex flex-col gap-3 rounded-xl border p-5" aria-labelledby="standard-titel">
        <h2 id="standard-titel" className="text-lg font-semibold">Standardwerte</h2>
        <p className="text-sm text-muted-foreground">
          Gelten für alle Räume ohne eigene Angabe. Umfang geschätzt = Faktor × √Bodenfläche, Wand = Umfang × Raumhöhe minus Abzug, in Bad/WC nur oberhalb der Fliesen.
          Die Werte merkt sich dieser Browser.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STD_FELDER.map((f) => (
            <label key={f.k} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{f.label}{f.einheit && ` (${f.einheit})`}</span>
              <input inputMode="decimal" className={EIN} value={stdText[f.k]} onChange={(e) => setStdText((s) => ({ ...s, [f.k]: e.target.value }))} />
              {mengeLesen(stdText[f.k]) !== std[f.k] && <span className="text-xs text-destructive">Ungültig, es gilt {formatZahl(std[f.k])}.</span>}
            </label>
          ))}
        </div>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setStdText({
            umfangFaktor: zahlText(FLAECHEN_STANDARD.umfangFaktor), raumhoehe: zahlText(FLAECHEN_STANDARD.raumhoehe),
            abzugProzent: zahlText(FLAECHEN_STANDARD.abzugProzent), fliesenhoehe: zahlText(FLAECHEN_STANDARD.fliesenhoehe),
          })}>Auf Standard zurücksetzen</Button>
        </div>
      </section>

      {/* 2. Räume prüfen */}
      <section className="flex flex-col gap-3 rounded-xl border p-5" aria-labelledby="raeume-titel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="raeume-titel" className="text-lg font-semibold">2. Räume prüfen</h2>
          {raeume.length > 0 && (
            <span className={cn("text-sm", ungeprueft ? "text-destructive" : "text-muted-foreground")}>
              {ungeprueft ? `${ungeprueft} von ${raeume.length} noch nicht geprüft` : `Alle ${raeume.length} Räume geprüft`}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Werte prüfen und in der ersten Spalte abhaken. Nur geprüfte Räume kommen ins Angebot. Jede Änderung hebt das Häkchen wieder auf.
          Leere Felder für Umfang und Höhe nutzen die Standardwerte.
        </p>
        {raeume.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-1 py-2 font-medium">Geprüft</th>
                  <th className="px-1 py-2 font-medium">Geschoss</th>
                  <th className="px-1 py-2 font-medium">Raum</th>
                  <th className="px-1 py-2 font-medium">Art</th>
                  <th className="px-1 py-2 font-medium">Boden m²</th>
                  <th className="px-1 py-2 font-medium">Umfang m</th>
                  <th className="px-1 py-2 font-medium">Höhe m</th>
                  <th className="px-1 py-2 font-medium">Decke m²</th>
                  <th className="px-1 py-2 font-medium">Belag</th>
                  <th className="px-1 py-2 font-medium">Sockel</th>
                  <th className="px-1 py-2 text-right font-medium">Wand m²</th>
                  <th className="px-1 py-2 text-right font-medium">Sockel lfm</th>
                  <th className="px-1 py-2"><span className="sr-only">Entfernen</span></th>
                </tr>
              </thead>
              <tbody>
                {raeume.map((r, i) => {
                  const f = flaechen[i];
                  const raum = raumListe[i];
                  const ohneBoden = !(raum.boden && raum.boden > 0);
                  const deckeFehlt = f.decke === null;
                  return (
                    <tr key={r.id} className={cn("border-b align-middle", !r.geprueft && "bg-amber-50/60")}>
                      <td className="px-1 py-1.5">
                        <label className="flex size-9 items-center justify-center" title={ohneBoden ? "Erst die Bodenfläche eintragen" : "Raum geprüft"}>
                          <input type="checkbox" className="size-5" checked={r.geprueft} disabled={ohneBoden}
                            aria-label={`${r.name || "Raum"} geprüft`} onChange={(e) => raumAendern(r.id, { geprueft: e.target.checked })} />
                        </label>
                      </td>
                      <td className="w-20 px-1 py-1.5"><input className={EIN} value={r.geschoss} maxLength={40} aria-label="Geschoss" onChange={(e) => raumAendern(r.id, { geschoss: e.target.value })} /></td>
                      <td className="px-1 py-1.5">
                        <input className={EIN} value={r.name} maxLength={120} aria-label="Raumname" onChange={(e) => raumAendern(r.id, { name: e.target.value })} />
                        {r.quelle !== "hand" && <span className="text-[10px] text-muted-foreground">aus {r.quelle === "ki" ? "KI" : "PDF"}</span>}
                      </td>
                      <td className="w-32 px-1 py-1.5">
                        <select className={EIN} value={r.art} aria-label="Raumart" onChange={(e) => {
                          const art = e.target.value as RaumArt;
                          raumAendern(r.id, { art, sockel: r.belag && art === "normal" });
                        }}>
                          {(Object.keys(RAUM_ART_NAMEN) as RaumArt[]).map((a) => <option key={a} value={a}>{RAUM_ART_NAMEN[a]}</option>)}
                        </select>
                      </td>
                      <td className="w-24 px-1 py-1.5"><input inputMode="decimal" className={cn(EIN, ohneBoden && "border-destructive")} value={r.boden} aria-label="Bodenfläche" onChange={(e) => raumAendern(r.id, { boden: e.target.value })} /></td>
                      <td className="w-28 px-1 py-1.5">
                        <input inputMode="decimal" className={EIN} value={r.umfang} placeholder={z2(f.umfang)} aria-label="Umfang gemessen" onChange={(e) => raumAendern(r.id, { umfang: e.target.value })} />
                        {f.geschaetzt.umfang && <Geschaetzt />}
                      </td>
                      <td className="w-20 px-1 py-1.5"><input inputMode="decimal" className={EIN} value={r.hoehe} placeholder={z2(std.raumhoehe)} aria-label="Raumhöhe" onChange={(e) => raumAendern(r.id, { hoehe: e.target.value })} /></td>
                      <td className="w-24 px-1 py-1.5">
                        <input inputMode="decimal" className={cn(EIN, deckeFehlt && "border-destructive")} value={r.decke}
                          placeholder={deckeFehlt ? "von Hand" : z2(f.decke ?? 0)} aria-label="Deckenfläche" onChange={(e) => raumAendern(r.id, { decke: e.target.value })} />
                        {deckeFehlt && <span className="text-[10px] text-destructive">Treppenhaus: bitte eintragen</span>}
                      </td>
                      <td className="px-1 py-1.5">
                        <label className="flex size-9 items-center justify-center">
                          <input type="checkbox" className="size-5" checked={r.belag} aria-label="Bodenbelag" onChange={(e) => raumAendern(r.id, { belag: e.target.checked, sockel: e.target.checked && r.sockel })} />
                        </label>
                      </td>
                      <td className="px-1 py-1.5">
                        <label className="flex size-9 items-center justify-center" title={r.belag ? "" : "Sockel nur bei Räumen mit Belag"}>
                          <input type="checkbox" className="size-5" checked={r.sockel && r.belag} disabled={!r.belag} aria-label="Sockelleiste" onChange={(e) => raumAendern(r.id, { sockel: e.target.checked })} />
                        </label>
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums">{z2(f.wand)}{f.geschaetzt.wand && <Geschaetzt />}</td>
                      <td className="px-1 py-1.5 text-right tabular-nums">{f.sockel ? <>{z2(f.sockel)}{f.geschaetzt.sockel && <Geschaetzt />}</> : "–"}</td>
                      <td className="px-1 py-1.5">
                        <button type="button" className="flex size-9 items-center justify-center rounded-md hover:bg-muted" aria-label={`${r.name || "Raum"} entfernen`}
                          onClick={() => setRaeume((alt) => alt.filter((x) => x.id !== r.id))}>
                          <Trash2Icon className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div>
          <Button type="button" variant="outline" onClick={() => setRaeume((alt) => [...alt, leererRaum(alt.at(-1)?.geschoss ?? "EG")])}>
            <PlusIcon /> Raum hinzufügen
          </Button>
        </div>
      </section>

      {/* 3. Leistungen */}
      <section className="flex flex-col gap-3 rounded-xl border p-5" aria-labelledby="leistungen-titel">
        <h2 id="leistungen-titel" className="text-lg font-semibold">3. Leistungen wählen</h2>
        <p className="text-sm text-muted-foreground">
          Je Zeile eine Leistung aus den Stammdaten, die Fläche und der Bereich. Die Menge kommt aus den geprüften Räumen, der Preis aus den Stammdaten.
        </p>
        {leistungen.length === 0 && <FormularMeldung art="hinweis">In den Stammdaten gibt es noch keine Leistungen.</FormularMeldung>}
        {zeilen.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-1 py-2 font-medium">Leistung</th>
                  <th className="px-1 py-2 font-medium">Fläche</th>
                  <th className="px-1 py-2 font-medium">Bereich</th>
                  <th className="px-1 py-2 text-right font-medium">Menge</th>
                  <th className="px-1 py-2 text-right font-medium">Preis</th>
                  <th className="px-1 py-2 text-right font-medium">Gesamt</th>
                  <th className="px-1 py-2"><span className="sr-only">Entfernen</span></th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((z, i) => {
                  const b = berechnet[i];
                  return (
                    <tr key={z.id} className="border-b align-top">
                      <td className="px-1 py-1.5">
                        <select className={EIN} value={z.serviceId} aria-label="Leistung" onChange={(e) => zeileAendern(z.id, { serviceId: e.target.value })}>
                          <option value="">Leistung wählen …</option>
                          {leistungen.map((l) => <option key={l.id} value={l.id}>{l.nummer ? `${l.nummer} · ` : ""}{l.name} ({formatBetrag(l.vk)}/{l.einheit})</option>)}
                        </select>
                        {b.fehler && <p className="mt-1 text-xs text-destructive">{b.fehler}</p>}
                        {b.l && !einheitPasst(b.l.einheit, z.flaeche) && (
                          <p className="mt-1 text-xs text-amber-800">Hinweis: Die Leistung wird in „{b.l.einheit}“ abgerechnet, die Fläche ist in {FLAECHEN_EINHEIT[z.flaeche]}.</p>
                        )}
                      </td>
                      <td className="w-28 px-1 py-1.5">
                        <select className={EIN} value={z.flaeche} aria-label="Fläche" onChange={(e) => zeileAendern(z.id, { flaeche: e.target.value as FlaechenArt })}>
                          {(Object.keys(FLAECHEN_ART_NAMEN) as FlaechenArt[]).map((a) => <option key={a} value={a}>{FLAECHEN_ART_NAMEN[a]}</option>)}
                        </select>
                      </td>
                      <td className="w-48 px-1 py-1.5">
                        <select className={EIN} value={z.bereich} aria-label="Bereich" onChange={(e) => zeileAendern(z.id, { bereich: e.target.value })}>
                          <option value="alle">Alle Räume</option>
                          {geschossListe.length > 0 && <optgroup label="Geschoss">{geschossListe.map((g) => <option key={g} value={`g:${g}`}>{g}</option>)}</optgroup>}
                          {raeume.length > 0 && <optgroup label="Raum">{raeume.map((r) => <option key={r.id} value={`r:${r.id}`}>{[r.geschoss, r.name || "ohne Namen"].filter(Boolean).join(" · ")}</option>)}</optgroup>}
                        </select>
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums">{b.fehler ? "–" : `${z2(b.menge)} ${FLAECHEN_EINHEIT[z.flaeche]}`}</td>
                      <td className="px-1 py-1.5 text-right tabular-nums">{b.l ? formatBetrag(b.l.vk) : "–"}</td>
                      <td className="px-1 py-1.5 text-right tabular-nums">{b.l && !b.fehler ? formatBetrag(Math.round(b.menge * b.l.vk * 100) / 100) : "–"}</td>
                      <td className="px-1 py-1.5">
                        <button type="button" className="flex size-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Zeile entfernen"
                          onClick={() => setZeilen((alt) => alt.filter((x) => x.id !== z.id))}>
                          <Trash2Icon className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="px-1 py-2 text-right font-semibold">Summe netto (vorläufig)</td>
                  <td className="px-1 py-2 text-right font-semibold tabular-nums">{formatBetrag(summe)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={leistungen.length === 0}
            onClick={() => setZeilen((alt) => [...alt, { id: crypto.randomUUID(), serviceId: "", flaeche: "wand", bereich: "alle" }])}>
            <PlusIcon /> Leistung hinzufügen
          </Button>
          <Button type="button" onClick={uebernehmen} disabled={gesperrt || speichert || !allesOk}>
            <CheckIcon /> {speichert ? "Wird übernommen …" : "Ins Angebot übernehmen"}
          </Button>
          <Link href={`/buero/angebote/${angebotId}`} className={buttonVariants({ variant: "ghost" })}>Zum Angebot</Link>
        </div>
        {!allesOk && zeilen.length > 0 && <p className="text-xs text-muted-foreground">Übernehmen geht erst, wenn jede Zeile eine Leistung hat und alle Räume im Bereich geprüft sind.</p>}
      </section>
    </div>
  );
}
