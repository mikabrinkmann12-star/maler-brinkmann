"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  MAHN_STUFEN,
  MAHN_STUFEN_NAMEN,
  STANDARD_RECHNUNGSEINSTELLUNGEN,
  eingabeAusEinstellungen,
  type RechnungsEinstellungenEingabe,
} from "@/lib/rechnung-einstellungen";
import { rechnungsEinstellungenSpeichern } from "./actions";

const EINGABE = "h-8 w-full rounded-md border border-border bg-white px-2.5 text-right text-[13px] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

function Feld({ label, einheit, children }: { label: string; einheit?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-1.5">
        {children}
        {einheit && <span className="w-8 shrink-0 text-xs text-muted-foreground">{einheit}</span>}
      </span>
    </label>
  );
}

/** Zahlungsziel & Skonto der Firma und die drei Mahnstufen (Frist, Verzugszinsen, Gebühr). */
export function RechnungenFormular({ start }: { start: RechnungsEinstellungenEingabe }) {
  const router = useRouter();
  const [w, setW] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function setzen(teil: Partial<RechnungsEinstellungenEingabe>) {
    setW((alt) => ({ ...alt, ...teil }));
    setFehler(null);
  }
  function stufe(k: (typeof MAHN_STUFEN)[number], teil: Partial<RechnungsEinstellungenEingabe[typeof k]>) {
    setW((alt) => ({ ...alt, [k]: { ...alt[k], ...teil } }));
    setFehler(null);
  }

  function speichern() {
    setFehler(null);
    starte(async () => {
      const r = await rechnungsEinstellungenSpeichern(w);
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Gespeichert.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border bg-white p-4">
        <div>
          <h2 className="text-[15px] font-semibold">Zahlungsziel &amp; Skonto</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Gilt für neue Angebote und Rechnungen, wenn der Kunde kein eigenes Zahlungsziel hat (das steht im Kontakt). Leer lassen = keine Vorgabe der Firma.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Feld label="Zahlungsziel" einheit="Tage">
            <input inputMode="numeric" value={w.zahlungszielTage} onChange={(e) => setzen({ zahlungszielTage: e.target.value })} placeholder="z. B. 14" className={EINGABE} />
          </Feld>
          <Feld label="Skonto" einheit="%">
            <input inputMode="decimal" value={w.skontoProzent} onChange={(e) => setzen({ skontoProzent: e.target.value })} placeholder="leer = keins" className={EINGABE} />
          </Feld>
          <Feld label="Skonto-Frist" einheit="Tage">
            <input inputMode="numeric" value={w.skontoTage} onChange={(e) => setzen({ skontoTage: e.target.value })} placeholder="z. B. 7" className={EINGABE} />
          </Feld>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border bg-white p-4">
        <div>
          <h2 className="text-[15px] font-semibold">Texte auf der Rechnung</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Mit diesen Texten werden neue Rechnungen vorbelegt. Sie gehen so an die Buchhaltung (sevdesk) und stehen auf der Rechnung. Im Rechnungsentwurf lassen sie sich
            ändern. Die Zahlungsbedingungen (Zahlungsziel, Skonto) hängt die App selbst unter den Schlusstext. Ganz leer lassen = die Buchhaltung nimmt ihren eigenen Text.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Anfangstext</span>
          <textarea rows={3} maxLength={3000} value={w.einleitung} onChange={(e) => setzen({ einleitung: e.target.value })} className="w-full rounded-md border bg-white px-2.5 py-2 text-[13px]" />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">Schlusstext</span>
          <textarea rows={4} maxLength={3000} value={w.schlusstext} onChange={(e) => setzen({ schlusstext: e.target.value })} className="w-full rounded-md border bg-white px-2.5 py-2 text-[13px]" />
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border bg-white p-4">
        <div>
          <h2 className="text-[15px] font-semibold">Mahnungen</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Frist, Verzugszinsen und Gebühr je Stufe. Die Mahnung selbst schreibst du in Lexware; die Werte erscheinen als Hinweis in der Rechnung, wenn du dort eine Mahnstufe vermerkst.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          {MAHN_STUFEN.map((k) => (
            <div key={k} className="grid items-end gap-4 sm:grid-cols-[10rem_repeat(3,minmax(0,1fr))]">
              <p className="pb-1.5 text-[13px] font-medium">{MAHN_STUFEN_NAMEN[k]}</p>
              <Feld label="Frist" einheit="Tage">
                <input inputMode="numeric" value={w[k].tage} onChange={(e) => stufe(k, { tage: e.target.value })} className={EINGABE} />
              </Feld>
              <Feld label="Verzugszinsen" einheit="%">
                <input inputMode="decimal" value={w[k].zinsenProzent} onChange={(e) => stufe(k, { zinsenProzent: e.target.value })} className={EINGABE} />
              </Feld>
              <Feld label="Gebühr" einheit="€">
                <input inputMode="decimal" value={w[k].gebuehr} onChange={(e) => stufe(k, { gebuehr: e.target.value })} className={EINGABE} />
              </Feld>
            </div>
          ))}
        </div>
      </section>

      {fehler && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{fehler}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" className="h-8 px-3 text-[13px]" disabled={laeuft} onClick={speichern}>{laeuft ? "Speichern …" : "Speichern"}</Button>
        <Button type="button" variant="ghost" className="h-8 px-3 text-[13px]" disabled={laeuft} onClick={() => { setW(eingabeAusEinstellungen(STANDARD_RECHNUNGSEINSTELLUNGEN)); setFehler(null); }}>
          Startwerte einsetzen
        </Button>
      </div>
    </div>
  );
}
