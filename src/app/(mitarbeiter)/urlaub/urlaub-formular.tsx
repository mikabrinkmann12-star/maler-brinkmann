"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDatum, formatStunden, formatStundenSaldo } from "@/lib/format";
import { abbauPruefen, sollSumme, type SollWoche } from "@/lib/ueberstunden";
import { URLAUB_ARTEN, URLAUB_ART_NAMEN, werktage, type UrlaubArt } from "@/lib/urlaub";
import { neueId } from "@/lib/warteschlange";
import { auftragSenden } from "../senden";

/** Mein Überstundenkonto, damit „Überstunden abfeiern“ schon beim Ausfüllen prüfen kann, ob es reicht. */
export type AbbauKonto = {
  stand: number;
  soll: SollWoche;
  /** Eigene offene/genehmigte Abfeier-Anträge ab heute */
  vorgemerkt: { von: string; bis: string }[];
};

/**
 * Urlaubsantrag stellen. Das Büro wird automatisch benachrichtigt, der Admin entscheidet.
 * „Überstunden abfeiern“ gibt es nur mit Überstundenkonto und nur, solange das Konto reicht.
 */
export function UrlaubFormular({ ichId, heute, konto }: { ichId: string; heute: string; konto: AbbauKonto | null }) {
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [art, setArt] = useState<UrlaubArt>("urlaub");
  const [bemerkung, setBemerkung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);
  const tage = von && bis ? werktage(von, bis) : 0;
  const arten = URLAUB_ARTEN.filter((a) => a !== "ueberstundenabbau" || konto);
  const abbau = art === "ueberstundenabbau" && konto && von && bis && bis >= von
    ? { ...abbauPruefen({ stand: konto.stand, soll: konto.soll, heute, neu: { von, bis }, vorgemerkt: konto.vorgemerkt }), tage: sollSumme(von, bis, konto.soll) }
    : null;

  async function absenden(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    if (sendet) return;
    if (!von || !bis) return setFehler("Bitte Beginn und Ende wählen.");
    if (bis < von) return setFehler("Das Ende darf nicht vor dem Beginn liegen.");
    if (abbau && !abbau.ok) return setFehler("Dein Überstundenkonto reicht dafür nicht. Beantrage weniger Tage.");
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
        {arten.map((a) => (
          <Button key={a} type="button" size="touch" className={a === "ueberstundenabbau" ? "col-span-2 px-2" : "px-2"}
            variant={art === a ? "default" : "outline"} aria-pressed={art === a}
            onClick={() => { setArt(a); setFehler(null); }}>
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
      {art === "ueberstundenabbau" && konto && (
        <p className="rounded-lg bg-muted p-3 text-sm" role="status">
          Dein Überstundenkonto: <strong>{formatStundenSaldo(konto.stand)}</strong> (Stand bis gestern).
          Abfeiern geht nur, solange das Konto danach nicht negativ wird.
          {abbau && (
            <span className={abbau.ok ? "mt-1 block" : "mt-1 block font-medium text-destructive"}>
              Dieser Antrag: {abbau.tage === 0 ? "kein Arbeitstag" : `${formatStunden(abbau.tage)} abfeiern`}
              {abbau.reserviert > 0 && `, andere Anträge ${formatStunden(abbau.reserviert)}`}
              {" "}→ Konto danach {formatStundenSaldo(abbau.nachher)}
              {!abbau.ok && ". Das reicht nicht."}
            </span>
          )}
        </p>
      )}
      {tage > 0 && art !== "ueberstundenabbau" && (
        <p className="text-sm" role="status">
          <strong>{tage === 1 ? "1 Werktag" : `${tage} Werktage`}</strong> (Mo–Fr ohne Feiertage)
          {von < heute && <span className="block text-amber-700">Achtung: Der Beginn liegt in der Vergangenheit.</span>}
        </p>
      )}

      <Feld label="Bemerkung (optional)" htmlFor="urlaub-bemerkung">
        <Input id="urlaub-bemerkung" value={bemerkung} maxLength={500} placeholder="z. B. Hochzeit Bruder"
          onChange={(e) => setBemerkung(e.target.value)} className="h-12 text-base" />
      </Feld>

      <Button type="submit" size="touch" disabled={sendet || Boolean(abbau && !abbau.ok)}>
        {sendet ? "Wird gesendet …" : "Antrag stellen"}
      </Button>
    </form>
  );
}
