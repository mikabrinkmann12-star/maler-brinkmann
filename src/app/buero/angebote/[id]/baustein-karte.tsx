"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, Trash2Icon, XIcon } from "lucide-react";
import { cn } from "cn";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BAUSTEIN_NAMEN,
  mengeLesen,
  einzelpreisLesen,
  positionGesamt,
  zahlFuerFeld,
  type Baustein,
  type BausteinTyp,
} from "@/lib/angebot";
import { formatBetrag } from "@/lib/format";
import { useEinheiten } from "@/components/einheiten-kontext";
import { AufmassWahl } from "../../aufmass-wahl";
import { bausteinLoeschen, bausteinSpeichern, bausteinVerschieben } from "../actions";


type Werte = { kurztext: string; langtext: string; menge: string; einheit: string; einzelpreis: string };

function startWerte(b: Baustein | null, einheitStandard: string): Werte {
  return {
    kurztext: b?.kurztext ?? "",
    langtext: b?.langtext ?? "",
    menge: b?.menge == null ? "" : zahlFuerFeld(b.menge),
    einheit: b?.einheit ?? einheitStandard,
    einzelpreis: b?.einzelpreis == null ? "" : zahlFuerFeld(b.einzelpreis, 2),
  };
}

/**
 * Ein Baustein des Angebots (Position, Titel, Text, Zwischensumme, Bild).
 * Mit `baustein = null` ist es ein neuer Baustein der Art `neuTyp`, der erst beim Speichern angelegt wird.
 */
export function BausteinKarte({
  angebotId,
  projektId,
  baustein,
  neuTyp,
  nachId,
  nummer,
  zwischensumme,
  bildUrl,
  gesperrt,
  erste,
  letzte,
  onFertig,
}: {
  angebotId: string;
  projektId: string;
  baustein: Baustein | null;
  neuTyp?: BausteinTyp;
  /** Neuer Baustein kommt hinter diesen (leer = ans Ende) */
  nachId?: string | null;
  nummer: string;
  zwischensumme: number | null;
  bildUrl?: string;
  gesperrt: boolean;
  erste: boolean;
  letzte: boolean;
  onFertig?: () => void;
}) {
  const router = useRouter();
  const typ: BausteinTyp = baustein?.typ ?? neuTyp ?? "text";
  const einheiten = useEinheiten();
  const start = startWerte(baustein, typ === "position" ? einheiten.position : "");
  const [w, setW] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [loeschenFrage, setLoeschenFrage] = useState(false);
  const [laeuft, starte] = useTransition();

  const geaendert = baustein === null || (Object.keys(start) as (keyof Werte)[]).some((k) => start[k] !== w[k]);
  const feld = (name: keyof Werte) => ({
    value: w[name],
    disabled: gesperrt,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setW((alt) => ({ ...alt, [name]: e.target.value }));
      setFehler(null);
    },
  });

  // Live-Gesamtpreis der Position
  const menge = mengeLesen(w.menge);
  const preis = einzelpreisLesen(w.einzelpreis);
  const gesamt = typ === "position" && menge !== null && preis !== null ? positionGesamt(menge, preis) : null;

  function speichern() {
    setFehler(null);
    starte(async () => {
      const r = await bausteinSpeichern(angebotId, baustein?.id ?? null, { typ, ...w }, nachId);
      if (r.fehler) return setFehler(r.fehler);
      onFertig?.();
      router.refresh();
    });
  }

  function aktion(f: () => Promise<{ fehler?: string }>) {
    setFehler(null);
    starte(async () => {
      const r = await f();
      if (r.fehler) return setFehler(r.fehler);
      router.refresh();
    });
  }

  const kopfFarbe =
    typ === "titel" ? "bg-primary/10" : typ === "zwischensumme" ? "bg-muted" : "bg-card";

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border p-3 sm:p-4", kopfFarbe)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 min-w-9 items-center justify-center rounded-md bg-muted px-2 text-sm font-semibold tabular-nums">
          {nummer || "·"}
        </span>
        <span className="text-sm font-medium text-muted-foreground">{BAUSTEIN_NAMEN[typ]}{baustein === null && " (neu)"}</span>
        <span className="ml-auto flex items-center gap-1">
          {baustein && !gesperrt && (
            <>
              <Button type="button" variant="ghost" size="icon" aria-label="Nach oben" disabled={erste || laeuft}
                onClick={() => aktion(() => bausteinVerschieben(angebotId, baustein.id, "hoch"))}><ArrowUpIcon /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Nach unten" disabled={letzte || laeuft}
                onClick={() => aktion(() => bausteinVerschieben(angebotId, baustein.id, "runter"))}><ArrowDownIcon /></Button>
              {loeschenFrage ? (
                <>
                  <Button type="button" variant="destructive" size="sm" disabled={laeuft}
                    onClick={() => aktion(() => bausteinLoeschen(angebotId, baustein.id))}>Wirklich löschen</Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Abbrechen" onClick={() => setLoeschenFrage(false)}><XIcon /></Button>
                </>
              ) : (
                <Button type="button" variant="ghost" size="icon" aria-label="Löschen" onClick={() => setLoeschenFrage(true)}><Trash2Icon /></Button>
              )}
            </>
          )}
          {baustein === null && (
            <Button type="button" variant="ghost" size="icon" aria-label="Abbrechen" onClick={onFertig}><XIcon /></Button>
          )}
        </span>
      </div>

      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      {typ === "titel" && (
        <Input aria-label="Titel" placeholder="Titel, z. B. „Wohnzimmer“" maxLength={200} className="h-11 text-base font-semibold" {...feld("kurztext")} />
      )}

      {typ === "text" && (
        <Textarea aria-label="Text" placeholder="Freier Text (ohne Preis)" rows={3} maxLength={5000} {...feld("langtext")} />
      )}

      {typ === "position" && (
        <>
          <Input aria-label="Kurztext" placeholder="Kurztext, z. B. „Wandflächen weiß streichen“" maxLength={200} className="h-11 text-base" {...feld("kurztext")} />
          <Textarea aria-label="Langtext" placeholder="Langtext (optional): was genau gemacht wird" rows={3} maxLength={5000} {...feld("langtext")} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Menge
              <Input inputMode="decimal" placeholder="0" className="h-11 w-28 text-right text-base" {...feld("menge")} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Einheit
              <Input list="einheiten-liste" maxLength={20} placeholder="m²" className="h-11 w-28 text-base" {...feld("einheit")} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              Preis (€)
              <Input inputMode="decimal" placeholder="0,00" className="h-11 w-32 text-right text-base" {...feld("einzelpreis")} />
            </label>
            <div className="ml-auto flex flex-col items-end text-sm text-muted-foreground">
              Gesamt
              <span className="text-lg font-semibold text-foreground tabular-nums">{gesamt === null ? "–" : formatBetrag(gesamt)}</span>
            </div>
          </div>
          <AufmassWahl projektId={projektId} positionsText={`${w.kurztext} ${w.langtext}`} gesperrt={gesperrt}
            onWahl={(menge, einheit) => { setW((alt) => ({ ...alt, menge: zahlFuerFeld(menge), einheit })); setFehler(null); }} />
          <datalist id="einheiten-liste">{einheiten.liste.map((e) => <option key={e} value={e} />)}</datalist>
        </>
      )}

      {typ === "zwischensumme" && (
        <p className="flex items-center justify-between text-base">
          <span className="text-muted-foreground">Zwischensumme der Positionen darüber</span>
          <span className="font-semibold tabular-nums">{formatBetrag(zwischensumme ?? 0)}</span>
        </p>
      )}

      {typ === "bild" && (
        <>
          {bildUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signierte Adresse aus dem privaten Speicher
            <img src={bildUrl} alt={w.kurztext || "Bild im Angebot"} className="max-h-64 w-fit max-w-full rounded-lg border object-contain" />
          ) : (
            <p className="text-sm text-muted-foreground">Bild wird geladen …</p>
          )}
          <Input aria-label="Bildunterschrift" placeholder="Bildunterschrift (optional)" maxLength={200} className="h-11 text-base" {...feld("kurztext")} />
        </>
      )}

      {!gesperrt && typ !== "zwischensumme" && geaendert && (
        <div>
          <Button type="button" onClick={speichern} disabled={laeuft}>
            <CheckIcon /> {laeuft ? "Speichern …" : baustein ? "Änderung speichern" : "Hinzufügen"}
          </Button>
        </div>
      )}
    </div>
  );
}
