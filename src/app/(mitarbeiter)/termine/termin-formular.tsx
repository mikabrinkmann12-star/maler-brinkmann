"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDatum } from "@/lib/format";
import { neueId } from "@/lib/warteschlange";
import { auftragSenden } from "../senden";

export type TerminBestehend = {
  id: string;
  datum: string;
  titel: string;
  zeit: string;
  ort: string;
  projectId: string | null;
  notiz: string;
  personIds: string[];
};

/**
 * Termin eintragen oder ändern.
 * Mitarbeiter tragen nur sich selbst ein (darfPersonen = false), das Büro wählt die Personen.
 */
export function TerminFormular({
  ichId,
  zurueck,
  startDatum,
  darfPersonen,
  personen,
  projekte,
  bestehend,
  darfAendern = true,
}: {
  ichId: string;
  zurueck: string;
  startDatum: string;
  darfPersonen: boolean;
  personen: { id: string; name: string }[];
  projekte: { id: string; name: string; ort: string }[];
  bestehend?: TerminBestehend;
  darfAendern?: boolean;
}) {
  const router = useRouter();
  const [datum, setDatum] = useState(bestehend?.datum ?? startDatum);
  const [titel, setTitel] = useState(bestehend?.titel ?? "");
  const [zeit, setZeit] = useState(bestehend?.zeit ?? "");
  const [ort, setOrt] = useState(bestehend?.ort ?? "");
  const [projectId, setProjectId] = useState(bestehend?.projectId ?? "");
  const [notiz, setNotiz] = useState(bestehend?.notiz ?? "");
  const [wer, setWer] = useState<string[]>(bestehend?.personIds ?? (darfPersonen ? [] : [ichId]));
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const sperre = !darfAendern;

  async function speichern(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    if (sendet || sperre) return;
    if (!titel.trim()) return setFehler("Bitte einen Titel eingeben (z. B. „Zu von Garrel“).");
    if (!wer.length) return setFehler("Bitte mindestens eine Person wählen.");
    setSendet(true);
    setFehler(null);
    const id = bestehend?.id ?? neueId();
    const r = await auftragSenden(
      ichId,
      {
        schluessel: bestehend ? `termin-aendern:${id}` : id,
        typ: "termin_speichern",
        titel: `Termin ${formatDatum(datum)}: ${titel.trim()}`,
        nutzlast: { daten: { id, datum, titel: titel.trim(), zeit, ort: ort.trim(), projectId: projectId || null, notiz: notiz.trim(), personIds: wer } },
      },
      { abgelehntBehalten: false },
    );
    setSendet(false);
    if (r.status === "abgelehnt") return setFehler(r.fehler);
    toast[r.status === "wartet" ? "warning" : "success"](
      r.status === "wartet" ? "Keine Verbindung. Der Termin liegt sicher auf dem Handy und wird automatisch gesendet." : "Termin gespeichert.",
    );
    router.push(zurueck);
  }

  async function loeschen() {
    if (!bestehend || !window.confirm("Diesen Termin löschen?")) return;
    const r = await auftragSenden(
      ichId,
      { schluessel: `termin-weg:${bestehend.id}`, typ: "termin_archivieren", titel: `Termin löschen: ${bestehend.titel}`, nutzlast: { id: bestehend.id } },
      { abgelehntBehalten: false },
    );
    if (r.status === "abgelehnt") return setFehler(r.fehler);
    toast.success(r.status === "wartet" ? "Keine Verbindung. Das Löschen wird nachgeholt." : "Termin gelöscht.");
    router.push(zurueck);
  }

  return (
    <form onSubmit={speichern} className="flex flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      <Feld label="Was ist der Termin?" htmlFor="termin-titel">
        <Input id="termin-titel" value={titel} maxLength={120} placeholder="z. B. Zu von Garrel" disabled={sperre}
          onChange={(e) => { setTitel(e.target.value); setFehler(null); }} className="h-12 text-base" />
      </Feld>

      <div className="grid grid-cols-2 gap-3">
        <Feld label="Tag" htmlFor="termin-datum">
          <Input id="termin-datum" type="date" value={datum} required disabled={sperre}
            onChange={(e) => setDatum(e.target.value)} className="h-12 text-base" />
        </Feld>
        <Feld label="Uhrzeit (optional)" htmlFor="termin-zeit">
          <Input id="termin-zeit" type="time" value={zeit} disabled={sperre}
            onChange={(e) => setZeit(e.target.value)} className="h-12 text-base" />
        </Feld>
      </div>

      <Feld label="Ort (optional)" htmlFor="termin-ort">
        <Input id="termin-ort" value={ort} maxLength={120} placeholder="z. B. Garrel, Hauptstraße 5" disabled={sperre}
          onChange={(e) => setOrt(e.target.value)} className="h-12 text-base" />
      </Feld>

      <Feld label="Baustelle (optional)" htmlFor="termin-projekt"
        hinweis="Mit Baustelle steht der Termin in der Einteilung des Tages schon vorbelegt.">
        <Auswahl id="termin-projekt" value={projectId} disabled={sperre} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">– keine –</option>
          {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ort && ` (${p.ort})`}</option>)}
        </Auswahl>
      </Feld>

      {darfPersonen && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-medium">Wer?</legend>
          <div className="flex flex-wrap gap-2">
            {personen.map((p) => (
              <button key={p.id} type="button" aria-pressed={wer.includes(p.id)} disabled={sperre}
                onClick={() => setWer((alt) => (alt.includes(p.id) ? alt.filter((x) => x !== p.id) : [...alt, p.id]))}
                className={`min-h-10 rounded-full border px-3 text-sm transition-colors ${wer.includes(p.id) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {p.name}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <Feld label="Notiz (optional)" htmlFor="termin-notiz">
        <Input id="termin-notiz" value={notiz} maxLength={500} disabled={sperre}
          onChange={(e) => setNotiz(e.target.value)} className="h-12 text-base" />
      </Feld>

      {!sperre && (
        <Button type="submit" size="touch" disabled={sendet}>{sendet ? "Speichern …" : "Termin speichern"}</Button>
      )}
      {sperre && <p className="rounded-lg bg-muted p-3 text-sm">Diesen Termin hat das Büro eingetragen. Änderungen bitte im Büro melden.</p>}
      {bestehend && !sperre && (
        <Button type="button" variant="destructive" size="touch" onClick={loeschen}>
          <Trash2Icon /> Termin löschen
        </Button>
      )}
    </form>
  );
}
