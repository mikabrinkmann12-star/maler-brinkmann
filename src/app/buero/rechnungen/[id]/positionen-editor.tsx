"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, TextIcon, Trash2Icon, XIcon } from "lucide-react";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { einzelpreisLesen, mengeLesen, positionGesamt, zahlFuerFeld } from "@/lib/angebot";
import { formatBetrag } from "@/lib/format";
import { EINHEITEN } from "@/lib/katalog";
import type { RechnungsBaustein } from "@/lib/rechnung";
import { rechnungBausteinLoeschen, rechnungBausteinSpeichern, rechnungBausteinVerschieben } from "../actions";

const EINHEITEN_LISTE = [...new Set([...EINHEITEN.leistung, ...EINHEITEN.material, "Lfm", "Pkg"])];

type Werte = { kurztext: string; langtext: string; menge: string; einheit: string; einzelpreis: string };
type Baustein = RechnungsBaustein & { id: string };

function startWerte(b: RechnungsBaustein | null, typ: "position" | "text"): Werte {
  return {
    kurztext: b?.kurztext ?? "",
    langtext: b?.langtext ?? "",
    menge: b?.menge == null ? (typ === "position" ? "1" : "") : zahlFuerFeld(b.menge),
    einheit: b?.einheit ?? "",
    einzelpreis: b?.einzelpreis == null ? "" : zahlFuerFeld(b.einzelpreis, 2),
  };
}

function Zeile({
  rechnungId, baustein, neuTyp, nummer, gesperrt, erste, letzte, onFertig,
}: {
  rechnungId: string;
  baustein: Baustein | null;
  neuTyp?: "position" | "text";
  nummer: string;
  gesperrt: boolean;
  erste: boolean;
  letzte: boolean;
  onFertig?: () => void;
}) {
  const router = useRouter();
  const typ = baustein?.typ ?? neuTyp ?? "position";
  const start = startWerte(baustein, typ);
  const [w, setW] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState(false);
  const [laeuft, starte] = useTransition();
  const geaendert = baustein === null || (Object.keys(start) as (keyof Werte)[]).some((k) => start[k] !== w[k]);
  const feld = (n: keyof Werte) => ({
    value: w[n],
    disabled: gesperrt,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setW((alt) => ({ ...alt, [n]: e.target.value })); setFehler(null); },
  });
  const menge = mengeLesen(w.menge);
  const preis = einzelpreisLesen(w.einzelpreis);
  const gesamt = typ === "position" && menge !== null && preis !== null ? positionGesamt(menge, preis) : null;

  function aktion(f: () => Promise<{ fehler?: string }>, danach?: () => void) {
    setFehler(null);
    starte(async () => {
      const r = await f();
      if (r.fehler) return setFehler(r.fehler);
      danach?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 min-w-9 items-center justify-center rounded-md bg-muted px-2 text-sm font-semibold tabular-nums">{nummer}</span>
        <span className="text-sm font-medium text-muted-foreground">{typ === "position" ? "Position" : "Textzeile"}{baustein === null && " (neu)"}</span>
        <span className="ml-auto flex items-center gap-1">
          {baustein && !gesperrt && (
            <>
              <Button type="button" variant="ghost" size="icon" aria-label="Nach oben" disabled={erste || laeuft} onClick={() => aktion(() => rechnungBausteinVerschieben(rechnungId, baustein.id, "hoch"))}><ArrowUpIcon /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Nach unten" disabled={letzte || laeuft} onClick={() => aktion(() => rechnungBausteinVerschieben(rechnungId, baustein.id, "runter"))}><ArrowDownIcon /></Button>
              {frage ? (
                <>
                  <Button type="button" variant="destructive" size="sm" disabled={laeuft} onClick={() => aktion(() => rechnungBausteinLoeschen(rechnungId, baustein.id))}>Wirklich löschen</Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Abbrechen" onClick={() => setFrage(false)}><XIcon /></Button>
                </>
              ) : (
                <Button type="button" variant="ghost" size="icon" aria-label="Löschen" onClick={() => setFrage(true)}><Trash2Icon /></Button>
              )}
            </>
          )}
          {baustein === null && <Button type="button" variant="ghost" size="icon" aria-label="Abbrechen" onClick={onFertig}><XIcon /></Button>}
        </span>
      </div>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <Input aria-label="Kurztext" placeholder={typ === "position" ? "Kurztext der Position" : "Text, z. B. Überschrift"} maxLength={200} className="h-11 text-base" {...feld("kurztext")} />
      <Textarea aria-label="Langtext" placeholder="Langtext (optional)" rows={2} maxLength={5000} {...feld("langtext")} />
      {typ === "position" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">Menge<Input inputMode="decimal" className="h-11 w-28 text-right text-base" {...feld("menge")} /></label>
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">Einheit<Input list="rechnung-einheiten" maxLength={20} className="h-11 w-28 text-base" {...feld("einheit")} /></label>
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">Preis netto (€)<Input inputMode="decimal" className="h-11 w-32 text-right text-base" {...feld("einzelpreis")} /></label>
          <div className="ml-auto flex flex-col items-end text-sm text-muted-foreground">Gesamt<span className="text-lg font-semibold text-foreground tabular-nums">{gesamt === null ? "–" : formatBetrag(gesamt)}</span></div>
        </div>
      )}
      {!gesperrt && geaendert && (
        <div>
          <Button type="button" disabled={laeuft} onClick={() => aktion(() => rechnungBausteinSpeichern(rechnungId, baustein?.id ?? null, { typ, ...w }), onFertig)}>
            <CheckIcon /> {laeuft ? "Speichern …" : baustein ? "Änderung speichern" : "Hinzufügen"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Positionen der Rechnung: Mengen und Preise ändern (z. B. nach dem Aufmaß), Zeilen hinzufügen, verschieben, löschen. */
export function PositionenEditor({ rechnungId, bausteine, gesperrt }: { rechnungId: string; bausteine: Baustein[]; gesperrt: boolean }) {
  const [neu, setNeu] = useState<"position" | "text" | null>(null);
  const nummern = bausteine.reduce<string[]>((acc, b) => {
    acc.push(b.typ === "position" ? `${acc.filter((x) => x !== "·").length + 1}.` : "·");
    return acc;
  }, []);
  return (
    <div className="flex flex-col gap-3">
      <datalist id="rechnung-einheiten">{EINHEITEN_LISTE.map((e) => <option key={e} value={e} />)}</datalist>
      {bausteine.length === 0 && <p className="rounded-xl border border-dashed p-6 text-muted-foreground">Noch keine Positionen.</p>}
      {bausteine.map((b, i) => (
        <Zeile key={`${b.id}:${b.kurztext}|${b.langtext}|${b.menge}|${b.einheit}|${b.einzelpreis}`} rechnungId={rechnungId} baustein={b}
          nummer={nummern[i]} gesperrt={gesperrt} erste={i === 0} letzte={i === bausteine.length - 1} />
      ))}
      {!gesperrt && (neu ? (
        <Zeile rechnungId={rechnungId} baustein={null} neuTyp={neu} nummer="neu" gesperrt={false} erste={false} letzte={false} onFertig={() => setNeu(null)} />
      ) : (
        <div className="flex flex-wrap gap-2 rounded-xl border border-dashed p-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setNeu("position")}><PlusIcon /> Position</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setNeu("text")}><TextIcon /> Textzeile</Button>
        </div>
      ))}
    </div>
  );
}
