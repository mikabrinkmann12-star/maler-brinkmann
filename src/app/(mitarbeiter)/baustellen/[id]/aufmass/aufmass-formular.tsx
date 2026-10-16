"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AUFMASS_EINHEITEN,
  EINHEIT_NAMEN,
  UEBERMESSEN_BIS_M2,
  aufmassBerechnen,
  zahlLesen,
  type AufmassEinheit,
} from "@/lib/aufmass";
import { formatZahl } from "@/lib/format";
import { neueId } from "@/lib/warteschlange";
import { auftragSenden } from "../../../senden";

export type BestehendesAufmass = {
  id: string;
  raum: string;
  position: string;
  einheit: AufmassEinheit;
  laenge: number | null;
  hoehe: number | null;
  anzahl: number;
  bemerkung: string;
  abzuege: { bezeichnung: string; breite: number; hoehe: number; anzahl: number }[];
};

type AbzugFeld = { schluessel: string; bezeichnung: string; breite: string; hoehe: string; anzahl: string };

const ABZUG_ARTEN = ["Fenster", "Tür", "Öffnung"];
const text = (z: number | null | undefined) => (z == null ? "" : formatZahl(z, { min: 0, max: 3 }).replace(/\./g, ""));
const zahl = (t: string) => zahlLesen(t) ?? 0;

function ZahlFeld({ id, label, wert, setzen, einheit }: { id: string; label: string; wert: string; setzen: (t: string) => void; einheit?: string }) {
  return (
    <Feld label={einheit ? `${label} (${einheit})` : label} htmlFor={id}>
      <Input id={id} inputMode="decimal" value={wert} placeholder="0" autoComplete="off"
        onChange={(e) => setzen(e.target.value)}
        aria-invalid={wert !== "" && zahlLesen(wert) == null}
        className="h-12 text-lg" />
    </Feld>
  );
}

/** Eine Aufmaß-Zeile erfassen: Raum, Position, Maße und Abzüge (Öffnungen). */
export function AufmassFormular({
  projektId,
  ichId,
  raeume,
  positionen,
  bestehend,
}: {
  projektId: string;
  ichId: string;
  raeume: string[];
  positionen: string[];
  bestehend?: BestehendesAufmass;
}) {
  const router = useRouter();
  const zurueck = `/baustellen/${projektId}/aufmass`;
  const [raum, setRaum] = useState(bestehend?.raum ?? "");
  const [position, setPosition] = useState(bestehend?.position ?? "");
  const [einheit, setEinheit] = useState<AufmassEinheit>(bestehend?.einheit ?? "m2");
  const [laenge, setLaenge] = useState(text(bestehend?.laenge));
  const [hoehe, setHoehe] = useState(text(bestehend?.hoehe));
  const [anzahl, setAnzahl] = useState(text(bestehend?.anzahl ?? 1));
  const [bemerkung, setBemerkung] = useState(bestehend?.bemerkung ?? "");
  const [abzuege, setAbzuege] = useState<AbzugFeld[]>(
    (bestehend?.abzuege ?? []).map((a) => ({ schluessel: neueId(), bezeichnung: a.bezeichnung, breite: text(a.breite), hoehe: text(a.hoehe), anzahl: text(a.anzahl) })),
  );
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  const ergebnis = aufmassBerechnen({
    einheit,
    laenge: zahl(laenge),
    hoehe: zahl(hoehe),
    anzahl: zahl(anzahl),
    abzuege: abzuege.map((a) => ({ bezeichnung: a.bezeichnung, breite: zahl(a.breite), hoehe: zahl(a.hoehe), anzahl: zahl(a.anzahl) || 1 })),
  });
  const vorschlaege = [...new Set([...positionen, "Wände streichen", "Decke streichen", "Tapezieren", "Spachteln", "Grundieren", "Lackieren", "Sockelleiste", "Fassade streichen"])];

  function abzugAendern(schluessel: string, feld: keyof Omit<AbzugFeld, "schluessel">, wert: string) {
    setAbzuege((alt) => alt.map((a) => (a.schluessel === schluessel ? { ...a, [feld]: wert } : a)));
  }

  function daten(id: string) {
    return {
      id,
      ersetztId: bestehend?.id ?? null,
      projektId,
      raum: raum.trim(),
      position: position.trim(),
      einheit,
      laenge: einheit === "stk" ? null : zahlLesen(laenge),
      hoehe: einheit === "m2" ? zahlLesen(hoehe) : null,
      anzahl: zahlLesen(anzahl) ?? 0,
      bemerkung: bemerkung.trim(),
      abzuege: einheit === "m2"
        ? abzuege
            .filter((a) => a.breite.trim() || a.hoehe.trim())
            .map((a) => ({ bezeichnung: a.bezeichnung.trim() || "Öffnung", breite: zahlLesen(a.breite) ?? 0, hoehe: zahlLesen(a.hoehe) ?? 0, anzahl: zahlLesen(a.anzahl) ?? 1 }))
        : [],
    };
  }

  async function speichern(weitere: boolean) {
    if (sendet) return;
    if (!raum.trim()) return setFehler("Bitte den Raum angeben (z. B. Wohnzimmer).");
    if (!position.trim()) return setFehler("Bitte angeben, was gemacht wird (z. B. Wände streichen).");
    if (einheit !== "stk" && !(zahl(laenge) > 0)) return setFehler("Bitte die Länge angeben.");
    if (einheit === "m2" && !(zahl(hoehe) > 0)) return setFehler("Bitte die Höhe bzw. Breite angeben.");
    if (!(zahl(anzahl) > 0)) return setFehler("Die Anzahl muss größer als 0 sein.");

    setSendet(true);
    setFehler(null);
    const id = neueId();
    const r = await auftragSenden(
      ichId,
      {
        schluessel: id,
        typ: "aufmass_speichern",
        titel: `Aufmaß ${raum.trim()}: ${position.trim()} ${formatZahl(ergebnis.menge)} ${EINHEIT_NAMEN[einheit]}`,
        nutzlast: { daten: daten(id) },
      },
      { abgelehntBehalten: false },
    );
    setSendet(false);
    if (r.status === "abgelehnt") {
      setFehler(r.fehler);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    toast[r.status === "wartet" ? "warning" : "success"](
      r.status === "wartet"
        ? "Keine Verbindung. Das Aufmaß liegt sicher auf dem Handy und wird automatisch gesendet."
        : `Gespeichert: ${formatZahl(ergebnis.menge)} ${EINHEIT_NAMEN[einheit]}`,
    );
    if (weitere) {
      // Gleicher Raum und gleiche Position, neue Maße (z. B. nächste Wand)
      setLaenge("");
      setHoehe(einheit === "m2" ? hoehe : "");
      setAnzahl("1");
      setAbzuege([]);
      setBemerkung("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      router.push(zurueck);
    }
  }

  async function loeschen() {
    if (!bestehend || !window.confirm("Diese Aufmaß-Zeile löschen?")) return;
    const r = await auftragSenden(
      ichId,
      { schluessel: `aufmass-weg:${bestehend.id}`, typ: "aufmass_archivieren", titel: `Aufmaß löschen: ${bestehend.raum} ${bestehend.position}`, nutzlast: { id: bestehend.id } },
      { abgelehntBehalten: false },
    );
    if (r.status === "abgelehnt") return setFehler(r.fehler);
    toast.success(r.status === "wartet" ? "Keine Verbindung. Das Löschen wird nachgeholt." : "Gelöscht.");
    router.push(zurueck);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void speichern(false); }} className="flex flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      <Feld label="Raum" htmlFor="raum">
        <Input id="raum" list="raeume" value={raum} maxLength={80} placeholder="z. B. Wohnzimmer" autoComplete="off"
          onChange={(e) => { setRaum(e.target.value); setFehler(null); }} className="h-12 text-base" />
        <datalist id="raeume">{raeume.map((r) => <option key={r} value={r} />)}</datalist>
      </Feld>

      <Feld label="Was wird gemacht?" htmlFor="position">
        <Input id="position" list="positionen" value={position} maxLength={120} placeholder="z. B. Wände streichen" autoComplete="off"
          onChange={(e) => { setPosition(e.target.value); setFehler(null); }} className="h-12 text-base" />
        <datalist id="positionen">{vorschlaege.map((p) => <option key={p} value={p} />)}</datalist>
      </Feld>

      <div className="flex flex-col gap-2">
        <p className="text-base font-medium" id="einheit-titel">Einheit</p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="einheit-titel">
          {AUFMASS_EINHEITEN.map((e) => (
            <Button key={e} type="button" size="touch" variant={einheit === e ? "default" : "outline"} aria-pressed={einheit === e}
              onClick={() => setEinheit(e)}>
              {EINHEIT_NAMEN[e]}
            </Button>
          ))}
        </div>
      </div>

      <div className={cn("grid gap-3", einheit === "m2" ? "grid-cols-3" : "grid-cols-2")}>
        {einheit !== "stk" && <ZahlFeld id="laenge" label="Länge" einheit="m" wert={laenge} setzen={setLaenge} />}
        {einheit === "m2" && <ZahlFeld id="hoehe" label="Höhe" einheit="m" wert={hoehe} setzen={setHoehe} />}
        <ZahlFeld id="anzahl" label="Anzahl" wert={anzahl} setzen={setAnzahl} />
      </div>

      {einheit === "m2" && (
        <div className="flex flex-col gap-3 rounded-xl border p-3">
          <div>
            <p className="font-medium">Abzüge (Fenster, Türen …)</p>
            <p className="text-sm text-muted-foreground">
              Öffnungen bis {formatZahl(UEBERMESSEN_BIS_M2)} m² werden übermessen (nicht abgezogen, VOB). Abzüge gelten für die ganze Zeile.
            </p>
          </div>
          {ergebnis.abzuege.map((a, i) => {
            const f = abzuege[i];
            return (
              <div key={f.schluessel} className="flex flex-col gap-2 rounded-lg bg-muted/50 p-2">
                <div className="flex items-center gap-2">
                  <Input aria-label="Bezeichnung" list="abzug-arten" value={f.bezeichnung} maxLength={50}
                    onChange={(e) => abzugAendern(f.schluessel, "bezeichnung", e.target.value)} className="h-12 flex-1 text-base" />
                  <Button type="button" variant="ghost" size="icon-touch" aria-label="Abzug entfernen"
                    onClick={() => setAbzuege((alt) => alt.filter((x) => x.schluessel !== f.schluessel))}>
                    <XIcon />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input aria-label="Breite (m)" placeholder="Breite" inputMode="decimal" value={f.breite}
                    onChange={(e) => abzugAendern(f.schluessel, "breite", e.target.value)} className="h-12 text-base" />
                  <Input aria-label="Höhe (m)" placeholder="Höhe" inputMode="decimal" value={f.hoehe}
                    onChange={(e) => abzugAendern(f.schluessel, "hoehe", e.target.value)} className="h-12 text-base" />
                  <Input aria-label="Anzahl" placeholder="Anz." inputMode="decimal" value={f.anzahl}
                    onChange={(e) => abzugAendern(f.schluessel, "anzahl", e.target.value)} className="h-12 text-base" />
                </div>
                {a.einzelflaeche > 0 && (
                  <p className={cn("text-sm font-medium", a.uebermessen ? "text-green-700" : "text-amber-700")}>
                    {formatZahl(a.einzelflaeche, { min: 2, max: 3 })} m² je Stück · {a.uebermessen ? "übermessen (bleibt drin)" : `wird abgezogen: −${formatZahl(a.abgezogen, { min: 2, max: 3 })} m²`}
                  </p>
                )}
              </div>
            );
          })}
          <datalist id="abzug-arten">{ABZUG_ARTEN.map((a) => <option key={a} value={a} />)}</datalist>
          <Button type="button" variant="outline" size="touch"
            onClick={() => setAbzuege((alt) => [...alt, { schluessel: neueId(), bezeichnung: "Fenster", breite: "", hoehe: "", anzahl: "1" }])}>
            <PlusIcon /> Abzug hinzufügen
          </Button>
        </div>
      )}

      <Feld label="Bemerkung (optional)" htmlFor="bemerkung">
        <Input id="bemerkung" value={bemerkung} maxLength={500} onChange={(e) => setBemerkung(e.target.value)} className="h-12 text-base" />
      </Feld>

      {/* Ergebnis + Speichern, bleibt über der unteren Navigation sichtbar */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <p className="text-center" role="status">
          <strong className="text-lg">{formatZahl(ergebnis.menge, { min: 2, max: 2 })} {EINHEIT_NAMEN[einheit]}</strong>
          {ergebnis.abzug > 0 && (
            <span className="text-sm text-muted-foreground"> ({formatZahl(ergebnis.brutto, { min: 2, max: 2 })} − {formatZahl(ergebnis.abzug, { min: 2, max: 2 })})</span>
          )}
        </p>
        <div className={cn("grid gap-2", bestehend ? "grid-cols-1" : "grid-cols-2")}>
          {!bestehend && (
            <Button type="button" variant="outline" size="touch" disabled={sendet} onClick={() => void speichern(true)}>
              + Weitere
            </Button>
          )}
          <Button type="submit" size="touch" disabled={sendet}>
            {sendet ? "Speichern …" : bestehend ? "Änderung speichern" : "Speichern"}
          </Button>
        </div>
      </div>

      {bestehend && (
        <Button type="button" variant="destructive" size="touch" onClick={loeschen}>
          <Trash2Icon /> Zeile löschen
        </Button>
      )}
    </form>
  );
}
