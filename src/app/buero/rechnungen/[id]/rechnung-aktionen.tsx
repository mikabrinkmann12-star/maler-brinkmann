"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanIcon, CheckIcon, MailIcon, SendIcon, WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBetrag, formatDatumZeit } from "@/lib/format";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { rechnungMailSchema } from "@/lib/rechnung-mail";
import { rechnungAlsBezahltBuchen, rechnungPerMailSenden, rechnungStornieren } from "../actions";

/** Rechnung per E-Mail an den Kunden schicken. Die E-Mail geht über die Buchhaltung (sie hängt die Rechnung an), Vorschlag zum Ändern. */
export function RechnungMailPanel({
  rechnungId,
  bereit,
  start,
  zuletzt,
}: {
  rechnungId: string;
  bereit: boolean;
  start: { an: string; betreff: string; text: string };
  zuletzt: { am: string; an: string } | null;
}) {
  const router = useRouter();
  const [w, setW] = useState(start);
  const [frage, setFrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  const f = (name: keyof typeof start) => ({
    value: w[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setW((alt) => ({ ...alt, [name]: e.target.value }));
      setFehler(null);
      setFrage(false);
    },
  });

  function pruefen() {
    const p = rechnungMailSchema.safeParse(w);
    if (!p.success) return setFehler(ersteMeldung(p.error));
    setFehler(null);
    setFrage(true);
  }

  function senden() {
    starte(async () => {
      const r = await rechnungPerMailSenden(rechnungId, w);
      if (r.fehler) return setFehler(r.fehler);
      setFrage(false);
      toast.success(`E-Mail an ${w.an} gesendet`);
      router.refresh();
    });
  }

  return (
    <details className="rounded-xl border p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-base font-semibold">
        <MailIcon className="size-5" /> Per E-Mail senden
        {zuletzt && <span className="text-sm font-normal text-muted-foreground">zuletzt am {formatDatumZeit(zuletzt.am)} an {zuletzt.an}</span>}
      </summary>
      <div className="flex flex-col gap-4 pt-4">
        {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
        <Feld label="An" htmlFor="rm-an" hinweis="Eine E-Mail-Adresse. Sie kommt vom Kunden, wenn dort eine hinterlegt ist.">
          <Input id="rm-an" type="email" inputMode="email" maxLength={320} className="h-12 text-base" {...f("an")} />
        </Feld>
        <Feld label="Betreff" htmlFor="rm-betreff">
          <Input id="rm-betreff" maxLength={200} className="h-12 text-base" {...f("betreff")} />
        </Feld>
        <Feld label="Text" htmlFor="rm-text" hinweis="Die Rechnung hängt als PDF an der E-Mail (bei Behörden mit Leitweg-ID als XRechnung).">
          <Textarea id="rm-text" rows={8} maxLength={5000} {...f("text")} />
        </Feld>
        <div className="flex flex-wrap items-center gap-2">
          {frage ? (
            <>
              <Button type="button" onClick={senden} disabled={laeuft || !bereit}><SendIcon /> {laeuft ? "Wird gesendet …" : `Ja, an ${w.an} senden`}</Button>
              <Button type="button" variant="ghost" onClick={() => setFrage(false)} disabled={laeuft}>Abbrechen</Button>
            </>
          ) : (
            <Button type="button" onClick={pruefen} disabled={!bereit}><CheckIcon /> Prüfen und senden</Button>
          )}
        </div>
      </div>
    </details>
  );
}

/** Zahlung buchen und Rechnung stornieren (beides nicht rücknehmbar, darum mit Bestätigung). */
export function ZahlungKarte({
  rechnungId,
  brutto,
  heute,
  kannBuchen,
  kannStornieren,
  bezahltAm,
}: {
  rechnungId: string;
  brutto: number | null;
  heute: string;
  kannBuchen: boolean;
  kannStornieren: boolean;
  bezahltAm: string | null;
}) {
  const router = useRouter();
  const [datum, setDatum] = useState(heute);
  const [frageBuchen, setFrageBuchen] = useState(false);
  const [frageStorno, setFrageStorno] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function ausfuehren(f: () => Promise<{ fehler?: string; hinweis?: string }>, ok: string) {
    setFehler(null);
    setHinweis(null);
    starte(async () => {
      const r = await f();
      setFrageBuchen(false);
      setFrageStorno(false);
      if (r.fehler) {
        setFehler(r.fehler);
        router.refresh();
        return;
      }
      if (r.hinweis) setHinweis(r.hinweis);
      toast.success(ok);
      router.refresh();
    });
  }

  if (!kannBuchen && !kannStornieren) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold"><WalletIcon className="size-4" /> Zahlung</h2>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {hinweis && <FormularMeldung art="hinweis">{hinweis}</FormularMeldung>}
      {kannBuchen && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">Ist das Geld da? Dann buche die Zahlung ({brutto !== null ? formatBetrag(brutto) : "voller Betrag"}). Zahlungen, die schon in der Buchhaltung stehen, kommen mit „Abgleichen“.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              Eingang am
              <Input type="date" value={datum} max={heute} onChange={(e) => { setDatum(e.target.value); setFrageBuchen(false); }} className="h-11 w-44" />
            </label>
            {frageBuchen ? (
              <>
                <Button type="button" disabled={laeuft} onClick={() => ausfuehren(() => rechnungAlsBezahltBuchen(rechnungId, datum), "Zahlung gebucht")}>{laeuft ? "Bucht …" : "Ja, als bezahlt buchen"}</Button>
                <Button type="button" variant="ghost" onClick={() => setFrageBuchen(false)} disabled={laeuft}>Abbrechen</Button>
              </>
            ) : (
              <Button type="button" variant="outline" disabled={!datum} onClick={() => setFrageBuchen(true)}><CheckIcon /> Als bezahlt buchen</Button>
            )}
          </div>
        </div>
      )}
      {bezahltAm && !kannBuchen && <p className="text-sm">Bezahlt am {bezahltAm.split("-").reverse().join(".")}.</p>}
      {kannStornieren && (
        <div className="flex flex-col gap-2 border-t pt-3">
          {frageStorno ? (
            <>
              <p className="text-sm">Die Rechnung wird storniert: Es entsteht eine Stornorechnung, die Rechnung gilt danach als storniert. Das lässt sich nicht rückgängig machen.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="destructive" disabled={laeuft} onClick={() => ausfuehren(() => rechnungStornieren(rechnungId), "Rechnung storniert")}>{laeuft ? "Storniert …" : "Ja, Rechnung stornieren"}</Button>
                <Button type="button" variant="ghost" onClick={() => setFrageStorno(false)} disabled={laeuft}>Abbrechen</Button>
              </div>
            </>
          ) : (
            <div>
              <Button type="button" variant="ghost" onClick={() => setFrageStorno(true)}><BanIcon /> Rechnung stornieren</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
