"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDatum } from "@/lib/format";
import { URLAUB_ARTEN, URLAUB_ART_NAMEN, werktage, type UrlaubArt } from "@/lib/urlaub";
import { neueId } from "@/lib/warteschlange";
import { auftragSenden } from "../senden";

/** Urlaubsantrag stellen. Das Büro wird automatisch benachrichtigt, der Admin entscheidet. */
export function UrlaubFormular({ ichId, heute }: { ichId: string; heute: string }) {
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [art, setArt] = useState<UrlaubArt>("urlaub");
  const [bemerkung, setBemerkung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const tage = von && bis ? werktage(von, bis) : 0;

  async function absenden(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    if (sendet) return;
    if (!von || !bis) return setFehler("Bitte Beginn und Ende wählen.");
    if (bis < von) return setFehler("Das Ende darf nicht vor dem Beginn liegen.");
    setSendet(true);
    setFehler(null);
    const id = neueId();
    const r = await auftragSenden(
      ichId,
      {
        schluessel: id,
        typ: "urlaub_beantragen",
        titel: `${URLAUB_ART_NAMEN[art]} ${formatDatum(von)}–${formatDatum(bis)}`,
        nutzlast: { daten: { id, von, bis, art, bemerkung: bemerkung.trim() } },
      },
      { abgelehntBehalten: false },
    );
    setSendet(false);
    if (r.status === "abgelehnt") return setFehler(r.fehler);
    setVon("");
    setBis("");
    setBemerkung("");
    if (r.status === "wartet") toast.warning("Keine Verbindung. Der Antrag liegt sicher auf dem Handy und wird automatisch gesendet.");
    else toast.success("Antrag gestellt. Du siehst hier, sobald er entschieden ist.");
  }

  return (
    <form onSubmit={absenden} className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">Urlaub beantragen</h2>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Art">
        {URLAUB_ARTEN.map((a) => (
          <Button key={a} type="button" size="touch" className="px-2" variant={art === a ? "default" : "outline"} aria-pressed={art === a}
            onClick={() => setArt(a)}>
            {URLAUB_ART_NAMEN[a]}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Feld label="Von" htmlFor="urlaub-von">
          <Input id="urlaub-von" type="date" value={von} required
            onChange={(e) => { setVon(e.target.value); if (!bis || e.target.value > bis) setBis(e.target.value); setFehler(null); }}
            className="h-12 text-base" />
        </Feld>
        <Feld label="Bis" htmlFor="urlaub-bis">
          <Input id="urlaub-bis" type="date" value={bis} min={von || undefined} required
            onChange={(e) => { setBis(e.target.value); setFehler(null); }} className="h-12 text-base" />
        </Feld>
      </div>
      {tage > 0 && (
        <p className="text-sm" role="status">
          <strong>{tage === 1 ? "1 Werktag" : `${tage} Werktage`}</strong> (Mo–Fr, Feiertage sind noch nicht abgezogen)
          {von < heute && <span className="block text-amber-700">Achtung: Der Beginn liegt in der Vergangenheit.</span>}
        </p>
      )}

      <Feld label="Bemerkung (optional)" htmlFor="urlaub-bemerkung">
        <Input id="urlaub-bemerkung" value={bemerkung} maxLength={500} placeholder="z. B. Hochzeit Bruder"
          onChange={(e) => setBemerkung(e.target.value)} className="h-12 text-base" />
      </Feld>

      <Button type="submit" size="touch" disabled={sendet}>
        {sendet ? "Wird gesendet …" : "Antrag stellen"}
      </Button>
    </form>
  );
}
