"use client";

import { useState, useTransition } from "react";
import { CheckIcon, PackageIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Auswahl } from "@/components/feld";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { zahlLesen } from "@/lib/aufmass";
import { formatZahl } from "@/lib/format";
import { neueId } from "@/lib/warteschlange";
import { auftragSenden } from "../../senden";
import { materialErledigt } from "../actions";

export const MATERIAL_EINHEITEN = ["Stk", "Eimer", "Liter", "kg", "Rolle", "Kartusche", "Packung", "Sack", "m", "m²"];

export type MaterialAnzeige = {
  id: string;
  material: string;
  menge: number;
  einheit: string;
  bemerkung: string;
  wer: string;
  wann: string;
  erledigt: string | null;
  darfLoeschen: boolean;
};

/** Material melden (freier Text, Menge, Einheit). Das Büro hakt ab, wenn es besorgt ist. */
export function Material({
  projektId,
  ichId,
  darfMelden,
  darfAbhaken,
  eintraege,
}: {
  projektId: string;
  ichId: string;
  darfMelden: boolean;
  darfAbhaken: boolean;
  eintraege: MaterialAnzeige[];
}) {
  const [material, setMaterial] = useState("");
  const [menge, setMenge] = useState("");
  const [einheit, setEinheit] = useState("Eimer");
  const [bemerkung, setBemerkung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const [laeuft, starte] = useTransition();
  const offen = eintraege.filter((e) => !e.erledigt);
  const erledigt = eintraege.filter((e) => e.erledigt);

  async function melden(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    if (sendet) return;
    const zahl = zahlLesen(menge);
    if (!material.trim()) return setFehler("Bitte angeben, welches Material gebraucht wird.");
    if (!zahl || zahl <= 0) return setFehler("Bitte eine Menge über 0 angeben (z. B. 2 oder 2,5).");
    setSendet(true);
    setFehler(null);
    const materialId = neueId();
    const r = await auftragSenden(
      ichId,
      {
        schluessel: materialId,
        typ: "material_melden",
        titel: `Material: ${formatZahl(zahl)} ${einheit} ${material.trim()}`,
        nutzlast: { daten: { id: materialId, projektId, material: material.trim(), menge: zahl, einheit, bemerkung: bemerkung.trim() } },
      },
      { abgelehntBehalten: false },
    );
    setSendet(false);
    if (r.status === "abgelehnt") return setFehler(r.fehler);
    setMaterial("");
    setMenge("");
    setBemerkung("");
    if (r.status === "wartet") toast.warning("Keine Verbindung. Die Meldung liegt sicher auf dem Handy und wird automatisch gesendet.");
    else toast.success("Material gemeldet. Das Büro sieht es jetzt.");
  }

  async function loeschen(e: MaterialAnzeige) {
    if (!window.confirm(`„${e.material}“ löschen?`)) return;
    const r = await auftragSenden(
      ichId,
      { schluessel: `material-weg:${e.id}`, typ: "material_archivieren", titel: `Material löschen: ${e.material}`, nutzlast: { id: e.id } },
      { abgelehntBehalten: false },
    );
    if (r.status === "abgelehnt") toast.error(r.fehler);
    else if (r.status === "wartet") toast.warning("Keine Verbindung. Das Löschen wird automatisch nachgeholt.");
  }

  function abhaken(e: MaterialAnzeige, fertig: boolean) {
    starte(async () => {
      try {
        const r = await materialErledigt(e.id, fertig);
        if (r.fehler) toast.error(r.fehler);
      } catch {
        toast.error("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  const zeile = (e: MaterialAnzeige) => (
      <li key={e.id} className="flex items-start gap-3 rounded-xl border p-3">
        <div className="min-w-0 flex-1">
          <p className={e.erledigt ? "text-muted-foreground line-through" : "font-medium"}>
            {formatZahl(e.menge)} {e.einheit} {e.material}
          </p>
          {e.bemerkung && <p className="text-sm">{e.bemerkung}</p>}
          <p className="text-sm text-muted-foreground">
            {e.wer} · {e.wann}{e.erledigt && ` · erledigt ${e.erledigt}`}
          </p>
        </div>
        {darfAbhaken && (
          <Button type="button" variant="outline" size="icon-touch" disabled={laeuft}
            aria-label={e.erledigt ? "Wieder offen" : "Als erledigt abhaken"} onClick={() => abhaken(e, !e.erledigt)}>
            {e.erledigt ? <RotateCcwIcon /> : <CheckIcon />}
          </Button>
        )}
        {e.darfLoeschen && !e.erledigt && (
          <Button type="button" variant="ghost" size="icon-touch" aria-label="Meldung löschen" onClick={() => loeschen(e)}>
            <Trash2Icon />
          </Button>
        )}
      </li>
  );

  return (
    <section id="material" className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <PackageIcon className="size-5" /> Material ({offen.length} offen)
      </h2>

      {darfMelden && (
        <form onSubmit={melden} className="flex flex-col gap-2 rounded-xl border p-3">
          <Input aria-label="Material" placeholder="Was wird gebraucht? (z. B. Wandfarbe weiß)" maxLength={200}
            value={material} onChange={(e) => { setMaterial(e.target.value); setFehler(null); }} className="h-12 text-base" />
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Menge" inputMode="decimal" placeholder="Menge" value={menge}
              onChange={(e) => { setMenge(e.target.value); setFehler(null); }} className="h-12 text-base" />
            <Auswahl aria-label="Einheit" value={einheit} onChange={(e) => setEinheit(e.target.value)}>
              {MATERIAL_EINHEITEN.map((x) => <option key={x} value={x}>{x}</option>)}
            </Auswahl>
          </div>
          <Input aria-label="Bemerkung (optional)" placeholder="Bemerkung (optional, z. B. bis Donnerstag)" maxLength={500}
            value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} className="h-12 text-base" />
          {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
          <Button type="submit" size="touch" variant="outline" disabled={sendet}>
            {sendet ? "Wird gemeldet …" : "Material melden"}
          </Button>
        </form>
      )}

      {eintraege.length === 0 && <p className="text-muted-foreground">Noch nichts gemeldet.</p>}
      {offen.length > 0 && <ul className="flex flex-col gap-2">{offen.map(zeile)}</ul>}
      {erledigt.length > 0 && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">Erledigt ({erledigt.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">{erledigt.map(zeile)}</ul>
        </details>
      )}
    </section>
  );
}
