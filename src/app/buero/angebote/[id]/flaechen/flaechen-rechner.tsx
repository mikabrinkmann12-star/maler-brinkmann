"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, ChevronDownIcon, FileUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { cn } from "cn";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatBetrag, formatZahl } from "@/lib/format";
import { flaechenSummen, geschosse, mengeLesen, raumFlaechen, sockelVorschlag, standardPruefen, wohnungen, zeilenMenge } from "@/lib/flaechen";
import {
  FLAECHEN_ART_NAMEN,
  FLAECHEN_EINHEIT,
  FLAECHEN_STANDARD,
  RAUM_ARTEN,
  RAUM_ART_NAMEN,
  type Bereich,
  type FlaechenArt,
  type FlaechenStandard,
  type Raum,
  type RaumArt,
  type RaumFlaechen,
} from "@/lib/flaechen-typen";
import { flaechenUebernehmen } from "../../flaechen-actions";
import type { GrundrissAntwort } from "./grundriss/route";

export type LeistungAuswahl = { id: string; name: string; nummer: string; einheit: string; vk: number };

// Maße als Text, damit „12,“ beim Tippen stehen bleibt; gerechnet wird mit mengeLesen()
type RaumEingabe = Omit<Raum, "boden" | "umfang" | "hoehe" | "decke"> & { boden: string; umfang: string; hoehe: string; decke: string };
type ZeileEingabe = { id: string; serviceId: string; flaeche: FlaechenArt; bereich: string };
type StandardEingabe = Record<keyof FlaechenStandard, string>;
type Datei = { hash: string; name: string };

const EIN = "h-9 w-full min-w-0 rounded-md border bg-white px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const zahlText = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
const z2 = (n: number) => formatZahl(n, { min: 2, max: 2 });
const SONDER_ARTEN = ["treppenhaus", "technik", "nebengebaeude"] as const;

function alsRaum(e: RaumEingabe): Raum {
  return { ...e, boden: mengeLesen(e.boden), umfang: mengeLesen(e.umfang), hoehe: mengeLesen(e.hoehe), decke: mengeLesen(e.decke) };
}
function alsEingabe(r: Raum): RaumEingabe {
  return { ...r, boden: zahlText(r.boden), umfang: zahlText(r.umfang), hoehe: zahlText(r.hoehe), decke: zahlText(r.decke) };
}
function alsStandard(s: StandardEingabe): FlaechenStandard {
  return standardPruefen(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, mengeLesen(v)])));
}
/** Bereich aus dem Wert der Auswahlliste („w“ = Wohnungen, „wn“ = ohne Bad/WC, „g:…“, „wo:…“, „a:…“, „r:…“). */
function alsBereich(wert: string): Bereich {
  if (wert === "wn") return { art: "wohnungen", ohneNass: true };
  if (wert.startsWith("g:")) return { art: "wohnungen", geschoss: wert.slice(2) };
  if (wert.startsWith("wo:")) return { art: "wohnung", wohnung: wert.slice(3) };
  if (wert.startsWith("a:")) return { art: "raumart", raumArt: wert.slice(2) as (typeof SONDER_ARTEN)[number] };
  // „r:id1,id2,…“ = mehrere ausgewählte Räume
  if (wert.startsWith("r:")) return { art: "raeume", ids: wert.slice(2).split(",").filter(Boolean) };
  return { art: "wohnungen" };
}
/** Passt die Einheit der Leistung zur Fläche? (nur Hinweis) */
function einheitPasst(einheit: string, flaeche: FlaechenArt): boolean {
  const e = einheit.toLowerCase().replace(/\s/g, "");
  return flaeche === "sockel" ? /^(lfm\.?|m|lfdm\.?|lfd\.m\.?)$/.test(e) : /^(m²|m2|qm)$/.test(e);
}

function leererRaum(geschoss: string): RaumEingabe {
  return { id: crypto.randomUUID(), geschoss, wohnung: "", name: "", boden: "", umfang: "", hoehe: "", decke: "", art: "wohnraum", sockel: true, seite: 0, quelle: "hand" };
}

/** Ältere Zwischenstände (vor der KI) in die heutige Form bringen. */
function raumAusSpeicher(r: Omit<Partial<RaumEingabe>, "art" | "quelle"> & { art?: string; quelle?: string }): RaumEingabe {
  const art: RaumArt = (RAUM_ARTEN as readonly string[]).includes(r.art ?? "") ? (r.art as RaumArt) : r.art === "nass" ? "bad" : "wohnraum";
  return {
    id: r.id ?? crypto.randomUUID(), geschoss: r.geschoss ?? "", wohnung: r.wohnung ?? "", name: r.name ?? "",
    boden: r.boden ?? "", umfang: r.umfang ?? "", hoehe: r.hoehe ?? "", decke: r.decke ?? "",
    art, sockel: art === "aussen" ? false : r.sockel ?? sockelVorschlag(art), seite: r.seite ?? 0, quelle: r.quelle === "ki" ? "ki" : "hand",
  };
}

/**
 * Foto für die KI vorbereiten: auf höchstens 2400 px Kantenlänge verkleinern und als JPG speichern.
 * So passt auch ein großes Handyfoto unter 4 MB, und Formate wie HEIC vom iPhone (Safari kann sie öffnen) werden zu JPG.
 */
async function fotoVerkleinern(datei: File): Promise<Blob> {
  const bild = await createImageBitmap(datei);
  const faktor = Math.min(1, 2400 / Math.max(bild.width, bild.height));
  const leinwand = document.createElement("canvas");
  leinwand.width = Math.round(bild.width * faktor);
  leinwand.height = Math.round(bild.height * faktor);
  const ctx = leinwand.getContext("2d");
  if (!ctx) throw new Error("kein Canvas");
  ctx.fillStyle = "#fff"; // durchsichtige PNGs auf Weiß
  ctx.fillRect(0, 0, leinwand.width, leinwand.height);
  ctx.drawImage(bild, 0, 0, leinwand.width, leinwand.height);
  bild.close();
  return new Promise((ok, fehler) => leinwand.toBlob((b) => (b ? ok(b) : fehler(new Error("kein Bild"))), "image/jpeg", 0.88));
}

/** Fingerabdruck einer Datei (SHA-256), um eine doppelt hochgeladene Datei zu erkennen. */
async function fingerabdruck(datei: File): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await datei.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

/**
 * Mehrere Räume für eine Leistung anhaken (z. B. „Boden spachteln“ nur in Büro und Wohnküche im 1. OG).
 * Nach Geschoss gruppiert, je Geschoss ein Knopf „alle“; Balkon/Terrasse sind nicht wählbar, weil sie nie zählen.
 */
function RaeumeWahl({ raeume, flaechen, flaeche, gewaehlt, onChange }: {
  raeume: RaumEingabe[];
  flaechen: RaumFlaechen[];
  flaeche: FlaechenArt;
  gewaehlt: string[];
  onChange: (ids: string[]) => void;
}) {
  const [offen, setOffen] = useState(gewaehlt.length === 0);
  const waehlbar = raeume.map((r, i) => ({ r, f: flaechen[i] })).filter((x) => x.r.art !== "aussen");
  const gruppen = [...new Set(waehlbar.map((x) => x.r.geschoss))];
  const an = new Set(gewaehlt);
  const umschalten = (ids: string[], setzen: boolean) => {
    const neu = new Set(an);
    for (const id of ids) {
      if (setzen) neu.add(id);
      else neu.delete(id);
    }
    // Reihenfolge wie in der Tabelle
    onChange(raeume.map((r) => r.id).filter((id) => neu.has(id)));
  };
  const wert = (f: RaumFlaechen) => f[flaeche];

  return (
    <div className="mt-1.5 rounded-md border bg-muted/30">
      <button type="button" aria-expanded={offen} onClick={() => setOffen((o) => !o)} className="flex min-h-9 w-full items-center gap-1.5 px-2 text-left text-xs font-medium">
        <ChevronDownIcon className={cn("size-4 transition-transform", !offen && "-rotate-90")} />
        {gewaehlt.length ? `${gewaehlt.length} ${gewaehlt.length === 1 ? "Raum" : "Räume"} gewählt` : "Noch kein Raum gewählt"}
      </button>
      {offen && (
        <div className="flex max-h-72 flex-col gap-2 overflow-y-auto border-t px-2 py-2">
          {gruppen.map((g) => {
            const inGruppe = waehlbar.filter((x) => x.r.geschoss === g);
            const alleAn = inGruppe.every((x) => an.has(x.r.id));
            return (
              <div key={g || "ohne"} className="flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{g || "ohne Geschoss"}</span>
                  <button type="button" className="text-xs underline underline-offset-4" onClick={() => umschalten(inGruppe.map((x) => x.r.id), !alleAn)}>
                    {alleAn ? "keine" : "alle"}
                  </button>
                </div>
                {inGruppe.map(({ r, f }) => (
                  <label key={r.id} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={an.has(r.id)} onChange={(e) => umschalten([r.id], e.target.checked)} />
                    <span className="min-w-0 flex-1 truncate">{[r.wohnung, r.name || "ohne Namen"].filter(Boolean).join(" · ")}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{wert(f) == null ? "–" : `${z2(wert(f) as number)} ${FLAECHEN_EINHEIT[flaeche]}`}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Geschaetzt() {
  return <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-900" title="Geschätzter Wert, bitte prüfen">geschätzt</span>;
}

/**
 * Flächenberechnung: Grundriss reinziehen (Claude API liest die Räume) → Tabelle prüfen und korrigieren → „Räume übernehmen“
 * → Leistungen je Bereich wählen („Aus Aufmaß“) → Positionen ins Angebot.
 * Räume und Leistungen bleiben im Browser zwischengespeichert (je Angebot), damit nichts verloren geht.
 */
export function FlaechenRechner({ angebotId, gesperrt, leistungen }: { angebotId: string; gesperrt: boolean; leistungen: LeistungAuswahl[] }) {
  const entwurfSchluessel = `flaechen-entwurf:${angebotId}`;
  const [raeume, setRaeume] = useState<RaumEingabe[]>([]);
  const [zeilen, setZeilen] = useState<ZeileEingabe[]>([]);
  const [dateien, setDateien] = useState<Datei[]>([]);
  // Stand der Tabelle beim Klick auf „Räume übernehmen“; jede Änderung danach hebt die Übernahme auf
  const [uebernommenStand, setUebernommenStand] = useState<string | null>(null);
  // Raumtabelle eingeklappt (Standard), aufklappen über den Pfeil bei „2. Räume prüfen“
  const [tabelleOffen, setTabelleOffen] = useState(false);
  const [stdText, setStdText] = useState<StandardEingabe>(() => ({
    umfangFaktor: zahlText(FLAECHEN_STANDARD.umfangFaktor), raumhoehe: zahlText(FLAECHEN_STANDARD.raumhoehe),
    abzugProzent: zahlText(FLAECHEN_STANDARD.abzugProzent), fliesenhoehe: zahlText(FLAECHEN_STANDARD.fliesenhoehe),
  }));
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [ziehen, setZiehen] = useState(false);
  const [liest, setLiest] = useState(false);
  const [fortschritt, setFortschritt] = useState("");
  const [speichert, starte] = useTransition();
  const dateiFeld = useRef<HTMLInputElement>(null);

  // Zwischenspeicher laden (nach dem ersten Zeichnen, weil localStorage nur im Browser da ist)
  useEffect(() => {
    const e = lesen<{ raeume?: Partial<RaumEingabe>[]; zeilen?: ZeileEingabe[]; dateien?: Datei[]; uebernommenStand?: string | null }>(entwurfSchluessel);
    const s = lesen<Partial<FlaechenStandard>>("flaechen-standard");
    /* eslint-disable react-hooks/set-state-in-effect -- einmaliges Laden aus dem Browser-Speicher */
    if (e?.raeume?.length) setRaeume(e.raeume.map(raumAusSpeicher));
    if (e?.zeilen?.length) setZeilen(e.zeilen.map((z) => ({ ...z, bereich: z.bereich === "alle" ? "w" : z.bereich })));
    if (e?.dateien?.length) setDateien(e.dateien);
    if (e?.uebernommenStand) setUebernommenStand(e.uebernommenStand);
    if (s) {
      const g = standardPruefen(s);
      setStdText({ umfangFaktor: zahlText(g.umfangFaktor), raumhoehe: zahlText(g.raumhoehe), abzugProzent: zahlText(g.abzugProzent), fliesenhoehe: zahlText(g.fliesenhoehe) });
    }
    setGeladen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [entwurfSchluessel]);
  useEffect(() => {
    if (geladen) schreiben(entwurfSchluessel, { raeume, zeilen, dateien, uebernommenStand });
  }, [geladen, entwurfSchluessel, raeume, zeilen, dateien, uebernommenStand]);

  const std = useMemo(() => alsStandard(stdText), [stdText]);
  useEffect(() => {
    if (geladen) schreiben("flaechen-standard", std);
  }, [geladen, std]);

  const raumListe = useMemo(() => raeume.map(alsRaum), [raeume]);
  const flaechen = useMemo(() => raumListe.map((r) => raumFlaechen(r, std)), [raumListe, std]);
  const summen = useMemo(() => flaechenSummen(raumListe, std), [raumListe, std]);
  const geschossListe = useMemo(() => geschosse(raumListe), [raumListe]);
  const wohnungsListe = useMemo(() => wohnungen(raumListe), [raumListe]);
  const stand = useMemo(() => JSON.stringify(raeume), [raeume]);
  const uebernommen = raeume.length > 0 && uebernommenStand === stand;
  const ohneBoden = raumListe.filter((r) => r.art !== "aussen" && !(r.boden && r.boden > 0));

  const berechnet = zeilen.map((z) => {
    const l = leistungen.find((x) => x.id === z.serviceId);
    if (!l) return { l: null, menge: 0, fehler: "Bitte eine Leistung wählen." };
    if (z.bereich === "r:") return { l, menge: 0, fehler: "Bitte Räume auswählen." };
    const m = zeilenMenge(raumListe, { id: z.id, serviceId: z.serviceId, flaeche: z.flaeche, bereich: alsBereich(z.bereich) }, std);
    return { l, menge: m.menge, fehler: m.fehler };
  });
  const summe = berechnet.reduce((s, b) => s + (b.l && !b.fehler ? b.menge * b.l.vk : 0), 0);
  const allesOk = uebernommen && zeilen.length > 0 && berechnet.every((b) => !b.fehler);

  function raumAendern(id: string, teil: Partial<RaumEingabe>) {
    setHinweis(null);
    setFehler(null);
    setRaeume((alt) => alt.map((r) => (r.id === id ? { ...r, ...teil } : r)));
  }
  function zeileAendern(id: string, teil: Partial<ZeileEingabe>) {
    setHinweis(null);
    setFehler(null);
    setZeilen((alt) => alt.map((z) => (z.id === id ? { ...z, ...teil } : z)));
  }

  /** Eine Datei an die KI schicken. Ergebnis: Meldung (gut oder Fehler) für die Sammelmeldung. */
  async function eineDateiLesen(datei: File, bekannt: Datei[]): Promise<{ ok: boolean; text: string; datei?: Datei; raeume?: Raum[]; tokens?: { eingabe: number; ausgabe: number } }> {
    const name = datei.name || "Foto";
    const istPdf = datei.type === "application/pdf" || /\.pdf$/i.test(datei.name);
    const istBild = datei.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(datei.name);
    if (!istPdf && !istBild) return { ok: false, text: `„${name}“: nur PDF oder Fotos.` };
    const hash = await fingerabdruck(datei);
    const schon = bekannt.find((d) => d.hash === hash);
    if (schon) return { ok: false, text: `„${name}“ wurde schon eingelesen${schon.name !== name ? ` (als „${schon.name}“)` : ""}.` };

    let senden: Blob = datei;
    if (istBild) {
      try {
        senden = await fotoVerkleinern(datei);
      } catch {
        return { ok: false, text: `„${name}“: Das Foto ließ sich nicht öffnen. Bitte als JPG oder PNG versuchen.` };
      }
    }
    if (senden.size > 4_000_000) return { ok: false, text: `„${name}“ ist zu groß (höchstens 4 MB).` };

    const daten = new FormData();
    daten.set("datei", senden, istBild ? "foto.jpg" : name);
    const antwort = await fetch(`/buero/angebote/${angebotId}/flaechen/grundriss`, { method: "POST", body: daten });
    const a = (await antwort.json()) as GrundrissAntwort;
    if (a.fehler) return { ok: false, text: `„${name}“: ${a.fehler}` };
    const neu = a.raeume ?? [];
    if (!neu.length) return { ok: false, text: `„${name}“: keine Räume gefunden, bitte von Hand eintragen.`, tokens: a.tokens };
    const leer = neu.filter((r) => r.art !== "aussen" && r.boden == null).length;
    return {
      ok: true,
      text: `„${name}“: ${neu.length} ${neu.length === 1 ? "Raum" : "Räume"}${leer ? `, bei ${leer} Fläche nicht lesbar` : ""}`,
      datei: { hash, name },
      raeume: neu,
      tokens: a.tokens,
    };
  }

  /** Mehrere Pläne oder Fotos nacheinander lesen (je Datei ein Aufruf der KI). */
  async function grundrisseLesen(liste: File[]) {
    if (!liste.length) return;
    setFehler(null);
    setHinweis(null);
    setLiest(true);
    const gut: string[] = [];
    const schlecht: string[] = [];
    const tokens = { eingabe: 0, ausgabe: 0 };
    const bekannt = [...dateien];
    try {
      for (const [i, datei] of liste.entries()) {
        setFortschritt(liste.length > 1 ? `${i + 1} von ${liste.length}: „${datei.name || "Foto"}“` : "");
        try {
          const r = await eineDateiLesen(datei, bekannt);
          if (r.tokens) { tokens.eingabe += r.tokens.eingabe; tokens.ausgabe += r.tokens.ausgabe; }
          if (!r.ok) { schlecht.push(r.text); continue; }
          bekannt.push(r.datei!);
          setRaeume((alt) => [...alt, ...r.raeume!.map(alsEingabe)]);
          setDateien((alt) => [...alt, r.datei!]);
          gut.push(r.text);
        } catch {
          schlecht.push(`„${datei.name || "Foto"}“ konnte nicht gelesen werden. Bitte nochmal versuchen.`);
        }
      }
    } finally {
      setLiest(false);
      setFortschritt("");
      if (dateiFeld.current) dateiFeld.current.value = "";
    }
    const verbrauch = tokens.eingabe ? ` Verbrauch: ${formatZahl(tokens.eingabe)} Token ein, ${formatZahl(tokens.ausgabe)} Token aus.` : "";
    if (gut.length) setHinweis(`Gelesen: ${gut.join("; ")}. Bitte die Tabelle prüfen und dann „Räume übernehmen“.${verbrauch}`);
    if (schlecht.length) setFehler(schlecht.join(" "));
  }

  function raeumeUebernehmen() {
    setFehler(null);
    if (ohneBoden.length) setTabelleOffen(true); // damit man die fehlenden Felder sieht
    if (ohneBoden.length) return setFehler(`Bitte zuerst die Bodenfläche eintragen: ${ohneBoden.map((r) => r.name || "ohne Namen").join(", ")}.`);
    setUebernommenStand(stand);
    setHinweis(`${raeume.length} Räume übernommen. Die Flächen stehen jetzt unten bei „Aus Aufmaß“ zur Verfügung.`);
  }

  function inAngebot() {
    setFehler(null);
    setHinweis(null);
    starte(async () => {
      const r = await flaechenUebernehmen(angebotId, {
        uebernommen,
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
  const summenZeile = (titel: string, s: { boden: number; bodenOhneNass: number; decke: number; wand: number; sockel: number; deckeFehlt: boolean }, stark = false) => (
    <tr key={titel} className={cn("border-b", stark && "font-semibold")}>
      <td className="px-1 py-1.5">{titel}</td>
      <td className="px-1 py-1.5 text-right tabular-nums">{z2(s.boden)}</td>
      <td className="px-1 py-1.5 text-right tabular-nums">{z2(s.bodenOhneNass)}</td>
      <td className="px-1 py-1.5 text-right tabular-nums">{z2(s.decke)}{s.deckeFehlt && <span className="ml-1 text-[10px] text-destructive">fehlt</span>}</td>
      <td className="px-1 py-1.5 text-right tabular-nums">{z2(s.wand)}<Geschaetzt /></td>
      <td className="px-1 py-1.5 text-right tabular-nums">{z2(s.sockel)}</td>
    </tr>
  );

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
            void grundrisseLesen(Array.from(e.dataTransfer.files ?? []));
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm text-muted-foreground",
            ziehen && "border-foreground bg-muted",
            liest && "pointer-events-none opacity-60",
          )}
        >
          <FileUpIcon className="size-6" />
          {liest
            ? `Die KI liest ${fortschritt ? `Datei ${fortschritt}` : "den Grundriss"} … (je Datei bis zu einer Minute)`
            : "Grundrisse (PDF oder Fotos) hierher ziehen oder klicken, auch mehrere auf einmal"}
          <span className="text-xs">PDF höchstens 4 MB, Fotos werden automatisch verkleinert. Jede Datei geht zum Auslesen an die Claude-KI (Anthropic), das kostet pro Datei ein paar Cent. Gespeichert wird nichts.</span>
          {/* image/* öffnet am iPhone/Android auch Galerie und Kamera */}
          <input ref={dateiFeld} type="file" multiple accept="application/pdf,.pdf,image/*" className="sr-only" onChange={(e) => void grundrisseLesen(Array.from(e.target.files ?? []))} />
        </label>
        {dateien.length > 0 && <p className="text-xs text-muted-foreground">Eingelesen: {dateien.map((d) => d.name).join(", ")}</p>}
      </section>

      {/* Standardwerte */}
      <section className="flex flex-col gap-3 rounded-xl border p-5" aria-labelledby="standard-titel">
        <h2 id="standard-titel" className="text-lg font-semibold">Standardwerte</h2>
        <p className="text-sm text-muted-foreground">
          Gelten für alle Räume ohne eigene Angabe. Umfang geschätzt = Faktor × √Bodenfläche, Wand = Umfang × Raumhöhe minus Abzug, in Bad und WC nur oberhalb der Fliesen.
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
        {/* Klickmenü: Raumtabelle standardmäßig eingeklappt, damit die Seite kürzer bleibt */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="raeume-titel" className="text-lg font-semibold">
            <button type="button" aria-expanded={tabelleOffen} aria-controls="raeume-tabelle" onClick={() => setTabelleOffen((o) => !o)}
              className="flex min-h-9 items-center gap-2 rounded-md text-left hover:underline hover:underline-offset-4">
              <ChevronDownIcon className={cn("size-5 transition-transform", !tabelleOffen && "-rotate-90")} />
              2. Räume prüfen{raeume.length > 0 && <span className="font-normal text-muted-foreground"> ({raeume.length})</span>}
            </button>
          </h2>
          {raeume.length > 0 && (
            <span className={cn("text-sm", uebernommen ? "text-muted-foreground" : "text-destructive")}>
              {uebernommen ? `${raeume.length} Räume übernommen` : "Noch nicht übernommen"}
            </span>
          )}
        </div>
        {tabelleOffen && (
          <p className="text-sm text-muted-foreground">
            Werte prüfen und korrigieren, Zeilen löschen oder ergänzen, dann einmal „Räume übernehmen“. Jede Änderung danach muss neu übernommen werden.
            Leere Felder für Umfang und Höhe nutzen die Standardwerte. Balkon und Terrasse zählen in keiner Fläche.
          </p>
        )}
        {tabelleOffen && raeume.length > 0 && (
          <div id="raeume-tabelle" className="overflow-x-auto">
            <table className="w-full min-w-[1150px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-1 py-2 font-medium">Geschoss</th>
                  <th className="px-1 py-2 font-medium">Wohnung</th>
                  <th className="px-1 py-2 font-medium">Raum</th>
                  <th className="px-1 py-2 font-medium">Art</th>
                  <th className="px-1 py-2 font-medium">Boden m²</th>
                  <th className="px-1 py-2 font-medium">Umfang m</th>
                  <th className="px-1 py-2 font-medium">Höhe m</th>
                  <th className="px-1 py-2 font-medium">Decke m²</th>
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
                  const aussen = r.art === "aussen";
                  const bodenFehlt = !aussen && !(raum.boden && raum.boden > 0);
                  const deckeFehlt = f.decke === null;
                  return (
                    <tr key={r.id} className={cn("border-b align-middle", aussen && "bg-muted/50 text-muted-foreground")}>
                      <td className="w-36 px-1 py-1.5"><input className={EIN} value={r.geschoss} maxLength={40} aria-label="Geschoss" onChange={(e) => raumAendern(r.id, { geschoss: e.target.value })} /></td>
                      <td className="w-28 px-1 py-1.5"><input className={EIN} value={r.wohnung} maxLength={60} aria-label="Wohnung" placeholder="–" onChange={(e) => raumAendern(r.id, { wohnung: e.target.value })} /></td>
                      <td className="px-1 py-1.5">
                        <input className={EIN} value={r.name} maxLength={120} aria-label="Raumname" onChange={(e) => raumAendern(r.id, { name: e.target.value })} />
                        {r.quelle === "ki" && <span className="text-[10px] text-muted-foreground">KI{r.seite ? `, Seite ${r.seite}` : ""}</span>}
                      </td>
                      <td className="w-36 px-1 py-1.5">
                        <select className={EIN} value={r.art} aria-label="Raumart" onChange={(e) => {
                          const art = e.target.value as RaumArt;
                          raumAendern(r.id, { art, sockel: sockelVorschlag(art) });
                        }}>
                          {RAUM_ARTEN.map((a) => <option key={a} value={a}>{RAUM_ART_NAMEN[a]}</option>)}
                        </select>
                        {aussen && <span className="text-[10px]">zählt nicht</span>}
                      </td>
                      <td className="w-24 px-1 py-1.5">
                        <input inputMode="decimal" className={cn(EIN, bodenFehlt && "border-destructive")} value={r.boden} placeholder={bodenFehlt ? "eintragen" : ""} aria-label="Bodenfläche" onChange={(e) => raumAendern(r.id, { boden: e.target.value })} />
                      </td>
                      <td className="w-28 px-1 py-1.5">
                        <input inputMode="decimal" className={EIN} value={r.umfang} disabled={aussen} placeholder={aussen ? "–" : z2(f.umfang)} aria-label="Umfang gemessen" onChange={(e) => raumAendern(r.id, { umfang: e.target.value })} />
                        {f.geschaetzt.umfang && <Geschaetzt />}
                      </td>
                      <td className="w-20 px-1 py-1.5"><input inputMode="decimal" className={EIN} value={r.hoehe} disabled={aussen} placeholder={aussen ? "–" : z2(std.raumhoehe)} aria-label="Raumhöhe" onChange={(e) => raumAendern(r.id, { hoehe: e.target.value })} /></td>
                      <td className="w-24 px-1 py-1.5">
                        <input inputMode="decimal" className={cn(EIN, deckeFehlt && "border-destructive")} value={aussen ? "" : r.decke} disabled={aussen}
                          placeholder={aussen ? "–" : deckeFehlt ? "von Hand" : z2(f.decke ?? 0)} aria-label="Deckenfläche" onChange={(e) => raumAendern(r.id, { decke: e.target.value })} />
                        {deckeFehlt && <span className="text-[10px] text-destructive">Treppenhaus: bitte eintragen</span>}
                      </td>
                      <td className="px-1 py-1.5">
                        <label className="flex size-9 items-center justify-center">
                          <input type="checkbox" className="size-5" checked={r.sockel && !aussen} disabled={aussen} aria-label="Sockelleiste" onChange={(e) => raumAendern(r.id, { sockel: e.target.checked })} />
                        </label>
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums">{aussen ? "–" : <>{z2(f.wand)}<Geschaetzt /></>}</td>
                      <td className="px-1 py-1.5 text-right tabular-nums">{f.sockel ? <>{z2(f.sockel)}{f.geschaetzt.sockel && <Geschaetzt />}</> : "–"}</td>
                      <td className="px-1 py-1.5">
                        <button type="button" className="flex size-9 items-center justify-center rounded-md hover:bg-muted" aria-label={`${r.name || "Raum"} entfernen`}
                          onClick={() => {
                            const rest = raeume.filter((x) => x.id !== r.id);
                            setRaeume(rest);
                            if (!rest.length) setDateien([]); // Tabelle leer: Dateien dürfen wieder eingelesen werden
                          }}>
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
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => { setTabelleOffen(true); setRaeume((alt) => [...alt, leererRaum(alt.at(-1)?.geschoss ?? "")]); }}>
            <PlusIcon /> Raum hinzufügen
          </Button>
          <Button type="button" onClick={raeumeUebernehmen} disabled={raeume.length === 0 || uebernommen}>
            <CheckIcon /> {uebernommen ? "Räume übernommen" : "Räume übernehmen"}
          </Button>
        </div>

        {raeume.length > 0 && (
          <div className="overflow-x-auto">
            <h3 className="mb-1 text-sm font-semibold">Summen der Wohnungsräume je Geschoss</h3>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-1 py-1.5 font-medium">Geschoss</th>
                  <th className="px-1 py-1.5 text-right font-medium">Boden m²</th>
                  <th className="px-1 py-1.5 text-right font-medium">ohne Bad/WC m²</th>
                  <th className="px-1 py-1.5 text-right font-medium">Decke m²</th>
                  <th className="px-1 py-1.5 text-right font-medium">Wand m²</th>
                  <th className="px-1 py-1.5 text-right font-medium">Sockel lfm</th>
                </tr>
              </thead>
              <tbody>
                {summen.geschosse.map((s) => summenZeile(s.geschoss || "ohne Geschoss", s))}
                {summenZeile("Alle Wohnungen", summen.wohnungen, true)}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              Getrennt, nur wenn in der Position ausdrücklich gewählt:{" "}
              {summen.sonderraeume.length ? summen.sonderraeume.map((s) => `${RAUM_ART_NAMEN[s.art]} ${z2(s.boden)} m² Boden (${s.anzahl})`).join(" · ") : "keine"}.
              {summen.aussen.anzahl > 0 && ` Balkon/Terrasse ${z2(summen.aussen.boden)} m² (${summen.aussen.anzahl}) zählen in keiner Summe.`}
            </p>
          </div>
        )}
      </section>

      {/* 3. Aus Aufmaß: Leistungen */}
      <section className="flex flex-col gap-3 rounded-xl border p-5" aria-labelledby="leistungen-titel">
        <h2 id="leistungen-titel" className="text-lg font-semibold">3. Aus Aufmaß: Leistungen wählen</h2>
        {!uebernommen ? (
          <FormularMeldung art="hinweis">Erst die Räume prüfen und „Räume übernehmen“ klicken. Danach stehen die Flächen hier zur Verfügung.</FormularMeldung>
        ) : (
          <p className="text-sm text-muted-foreground">
            Je Zeile eine Leistung aus den Stammdaten, die Fläche und der Bereich. Standard sind die Räume der Wohnungen. Treppenhaus, Technik und Nebengebäude
            zählen nur, wenn du sie als Bereich wählst. Die Menge kommt aus der Raumtabelle, der Preis aus den Stammdaten.
          </p>
        )}
        {leistungen.length === 0 && <FormularMeldung art="hinweis">In den Stammdaten gibt es noch keine Leistungen.</FormularMeldung>}
        {uebernommen && zeilen.length > 0 && (
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
                      <td className="w-56 px-1 py-1.5">
                        <select className={EIN} value={z.bereich.startsWith("r:") ? "r:" : z.bereich} aria-label="Bereich"
                          onChange={(e) => zeileAendern(z.id, { bereich: e.target.value === "r:" && z.bereich.startsWith("r:") ? z.bereich : e.target.value })}>
                          <option value="w">Alle Wohnungen</option>
                          <option value="wn">Alle Wohnungen ohne Bad/WC</option>
                          {geschossListe.length > 0 && <optgroup label="Wohnungen im Geschoss">{geschossListe.map((g) => <option key={g} value={`g:${g}`}>{g}</option>)}</optgroup>}
                          {wohnungsListe.length > 0 && <optgroup label="Wohnung">{wohnungsListe.map((w) => <option key={w} value={`wo:${w}`}>{w}</option>)}</optgroup>}
                          <optgroup label="Nur ausdrücklich">
                            {SONDER_ARTEN.map((a) => <option key={a} value={`a:${a}`}>{RAUM_ART_NAMEN[a]}</option>)}
                          </optgroup>
                          <option value="r:">Räume auswählen …</option>
                        </select>
                        {z.bereich.startsWith("r:") && (
                          <RaeumeWahl
                            raeume={raeume}
                            flaechen={flaechen}
                            flaeche={z.flaeche}
                            gewaehlt={z.bereich.slice(2).split(",").filter(Boolean)}
                            onChange={(ids) => zeileAendern(z.id, { bereich: `r:${ids.join(",")}` })}
                          />
                        )}
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
          <Button type="button" variant="outline" disabled={leistungen.length === 0 || !uebernommen}
            onClick={() => setZeilen((alt) => [...alt, { id: crypto.randomUUID(), serviceId: "", flaeche: "wand", bereich: "w" }])}>
            <PlusIcon /> Leistung hinzufügen
          </Button>
          <Button type="button" onClick={inAngebot} disabled={gesperrt || speichert || !allesOk}>
            <CheckIcon /> {speichert ? "Wird übernommen …" : "Ins Angebot übernehmen"}
          </Button>
          <Link href={`/buero/angebote/${angebotId}`} className={buttonVariants({ variant: "ghost" })}>Zum Angebot</Link>
        </div>
      </section>
    </div>
  );
}
