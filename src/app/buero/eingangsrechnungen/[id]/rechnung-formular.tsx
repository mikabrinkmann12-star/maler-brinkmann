"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { zahlFuerFeld } from "@/lib/angebot";
import { BEREICHE, BEREICH_NAMEN, type Bereich, type EingangsrechnungEingabe, type Zahlstatus } from "@/lib/eingangsrechnung";
import { eingangsrechnungArchivieren, eingangsrechnungSpeichern } from "../actions";

const EINGABE = "h-9 w-full rounded-md border border-border bg-white px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export type FormularStart = {
  id: string;
  lieferant: string;
  rechnungsnummer: string;
  rechnungsdatum: string | null;
  faelligAm: string | null;
  netto: number | null;
  brutto: number | null;
  iban: string;
  zahlstatus: Zahlstatus;
  bezahltAm: string | null;
  projectId: string | null;
  bereich: Bereich | null;
  notiz: string;
  zuPruefen: boolean;
  archiviert: boolean;
};

function Zeile({ label, children, hinweis }: { label: string; children: React.ReactNode; hinweis?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="font-medium">{label}</span>
      {children}
      {hinweis && <span className="text-xs text-muted-foreground">{hinweis}</span>}
    </label>
  );
}

/** Eingangsrechnung prüfen und bearbeiten: Felder, Kostenzuweisung (Projekt oder Bereich), Zahlstatus. */
export function RechnungFormular({ start, projekte }: { start: FormularStart; projekte: { id: string; text: string }[] }) {
  const router = useRouter();
  const [lieferant, setLieferant] = useState(start.lieferant);
  const [nummer, setNummer] = useState(start.rechnungsnummer);
  const [datum, setDatum] = useState(start.rechnungsdatum ?? "");
  const [faellig, setFaellig] = useState(start.faelligAm ?? "");
  const [netto, setNetto] = useState(start.netto === null ? "" : zahlFuerFeld(start.netto, 2));
  const [brutto, setBrutto] = useState(start.brutto === null ? "" : zahlFuerFeld(start.brutto, 2));
  const [iban, setIban] = useState(start.iban);
  const [zahlstatus, setZahlstatus] = useState<Zahlstatus>(start.zahlstatus);
  const [bezahltAm, setBezahltAm] = useState(start.bezahltAm ?? "");
  const [zuweisung, setZuweisung] = useState(start.projectId ? `p:${start.projectId}` : start.bereich ? `b:${start.bereich}` : "");
  const [notiz, setNotiz] = useState(start.notiz);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  // Das aktuelle Projekt steht immer in der Auswahl, auch wenn es inzwischen archiviert ist
  const projektListe = projekte;

  function eingabe(): EingangsrechnungEingabe {
    return {
      lieferant,
      rechnungsnummer: nummer,
      rechnungsdatum: datum || null,
      faelligAm: faellig || null,
      netto,
      brutto,
      iban,
      zahlstatus,
      bezahltAm: zahlstatus === "bezahlt" ? bezahltAm || null : null,
      projectId: zuweisung.startsWith("p:") ? zuweisung.slice(2) : null,
      bereich: zuweisung.startsWith("b:") ? (zuweisung.slice(2) as Bereich) : null,
      notiz,
    };
  }

  function speichern(bestaetigen: boolean) {
    setFehler(null);
    starte(async () => {
      const r = await eingangsrechnungSpeichern(start.id, eingabe(), bestaetigen);
      if (r.fehler) return setFehler(r.fehler);
      toast.success(bestaetigen ? "Rechnung geprüft und gespeichert" : "Gespeichert");
      if (bestaetigen) router.push("/buero/eingangsrechnungen");
      else router.refresh();
    });
  }

  function archivieren(archivieren: boolean) {
    setFehler(null);
    starte(async () => {
      const r = await eingangsrechnungArchivieren(start.id, archivieren);
      if (r.fehler) return setFehler(r.fehler);
      toast.success(archivieren ? "Ins Archiv gelegt" : "Wiederhergestellt");
      router.push("/buero/eingangsrechnungen");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Zeile label="Lieferant">
        <input value={lieferant} onChange={(e) => setLieferant(e.target.value)} maxLength={200} className={EINGABE} placeholder="z. B. Farben Müller GmbH" />
      </Zeile>
      <div className="grid gap-4 sm:grid-cols-2">
        <Zeile label="Rechnungsnummer">
          <input value={nummer} onChange={(e) => setNummer(e.target.value)} maxLength={100} className={EINGABE} />
        </Zeile>
        <Zeile label="IBAN">
          <input value={iban} onChange={(e) => setIban(e.target.value)} maxLength={40} className={EINGABE} />
        </Zeile>
        <Zeile label="Rechnungsdatum">
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className={EINGABE} />
        </Zeile>
        <Zeile label="Fällig am">
          <input type="date" value={faellig} onChange={(e) => setFaellig(e.target.value)} className={EINGABE} />
        </Zeile>
        <Zeile label="Betrag netto (€)">
          <input inputMode="decimal" value={netto} onChange={(e) => setNetto(e.target.value)} className={`${EINGABE} text-right tabular-nums`} placeholder="0,00" />
        </Zeile>
        <Zeile label="Betrag brutto (€)">
          <input inputMode="decimal" value={brutto} onChange={(e) => setBrutto(e.target.value)} className={`${EINGABE} text-right tabular-nums`} placeholder="0,00" />
        </Zeile>
      </div>

      <Zeile label="Kostenzuweisung" hinweis="Zu welchem Projekt oder Betriebsbereich gehören die Kosten?">
        <select value={zuweisung} onChange={(e) => setZuweisung(e.target.value)} className={EINGABE}>
          <option value="">Nicht zugewiesen</option>
          <optgroup label="Betriebsbereiche">
            {BEREICHE.map((b) => <option key={b} value={`b:${b}`}>{BEREICH_NAMEN[b]}</option>)}
          </optgroup>
          <optgroup label="Projekte">
            {projektListe.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.text}</option>)}
          </optgroup>
        </select>
      </Zeile>

      <div className="grid gap-4 sm:grid-cols-2">
        <Zeile label="Zahlstatus">
          <select value={zahlstatus} onChange={(e) => setZahlstatus(e.target.value as Zahlstatus)} className={EINGABE}>
            <option value="offen">Offen</option>
            <option value="bezahlt">Bezahlt</option>
          </select>
        </Zeile>
        {zahlstatus === "bezahlt" && (
          <Zeile label="Bezahlt am">
            <input type="date" value={bezahltAm} onChange={(e) => setBezahltAm(e.target.value)} className={EINGABE} />
          </Zeile>
        )}
      </div>

      <Zeile label="Notiz">
        <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={3} maxLength={2000} className={`${EINGABE} h-auto py-2`} />
      </Zeile>

      {fehler && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{fehler}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {start.zuPruefen && (
          <Button type="button" className="h-9 px-3 text-[13px]" disabled={laeuft} onClick={() => speichern(true)}>
            {laeuft ? "Speichern …" : "Geprüft & speichern"}
          </Button>
        )}
        <Button type="button" variant={start.zuPruefen ? "outline" : "default"} className="h-9 px-3 text-[13px]" disabled={laeuft} onClick={() => speichern(false)}>
          Speichern
        </Button>
        <Button type="button" variant="ghost" className="ml-auto h-9 px-3 text-[13px]" disabled={laeuft} onClick={() => archivieren(!start.archiviert)}>
          {start.archiviert ? "Wiederherstellen" : "Archivieren"}
        </Button>
      </div>
    </div>
  );
}
