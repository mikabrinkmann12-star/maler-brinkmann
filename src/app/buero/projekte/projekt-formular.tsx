"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { AdressFelder } from "@/components/formular/adress-felder";
import { Abschnitt, EINGABE, Zeile } from "@/components/formular/zeile";
import { DatumWahl } from "@/components/listen/datum-wahl";
import { MehrfachListe } from "@/components/listen/mehrfach-liste";
import { StatusPille } from "@/components/status-pille";
import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { personKreis } from "@/lib/listen-anzeige";
import { kundenFinden, projektSpeichern, type KundeTreffer } from "./actions";

export type ProjektFormWerte = {
  projektnummer: string;
  name: string;
  kunde: KundeTreffer | null;
  statusId: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  startDatum: string;
  endDatum: string;
  beschreibung: string;
  bueroAnsprechpartnerId: string;
  mitarbeiterIds: string[];
};

/**
 * Projekt anlegen und bearbeiten im Aufbau von Plancraft (Mika, 18.10.2026): Kopfzeile mit Abbrechen und „Projekt erstellen“,
 * Abschnitte Allgemein, Mitarbeiter, Kunde, Baustellenadresse. Leere Projektnummer = die App vergibt die nächste.
 */
export function ProjektFormular({
  id,
  start,
  status,
  buero,
  personen,
  vorschlag,
  heute,
  zurueck,
}: {
  id: string | null;
  start: ProjektFormWerte;
  status: { id: string; name: string; farbe: string }[];
  buero: { id: string; name: string }[];
  personen: { id: string; name: string }[];
  /** Nummer, die bei leerem Feld vergeben würde (nur beim Anlegen) */
  vorschlag?: string;
  heute: string;
  zurueck: string;
}) {
  const router = useRouter();
  const [w, setW] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<KundeTreffer[]>([]);

  const feld = (name: keyof Omit<ProjektFormWerte, "kunde" | "mitarbeiterIds" | "land">) => ({
    value: w[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setW((alt) => ({ ...alt, [name]: e.target.value }));
      setFehler(null);
    },
  });

  // Kundensuche mit kurzer Verzögerung (beim Tippen, nicht in einem Effekt)
  const timer = useRef<number | undefined>(undefined);
  const letzteSuche = useRef("");
  function sucheAendern(text: string) {
    setSuche(text);
    window.clearTimeout(timer.current);
    letzteSuche.current = text;
    if (text.trim().length < 2) return setTreffer([]);
    timer.current = window.setTimeout(async () => {
      const r = await kundenFinden(text);
      if (letzteSuche.current === text) setTreffer(r); // nur die neueste Suche zählt
    }, 250);
  }

  function kundeWaehlen(k: KundeTreffer) {
    const adresseLeer = !w.strasse && !w.plz && !w.ort;
    setW((alt) => ({ ...alt, kunde: k, ...(adresseLeer ? { strasse: k.strasse, plz: k.plz, ort: k.ort, land: k.land } : {}) }));
    sucheAendern("");
    setFehler(null);
  }

  function speichern(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    if (!w.name.trim()) return setFehler("Bitte einen Projektnamen eingeben.");
    starte(async () => {
      const r = await projektSpeichern(id, {
        projektnummer: w.projektnummer,
        name: w.name,
        contactId: w.kunde?.id ?? null,
        statusId: w.statusId,
        strasse: w.strasse,
        plz: w.plz,
        ort: w.ort,
        land: w.land,
        startDatum: w.startDatum,
        endDatum: w.endDatum,
        beschreibung: w.beschreibung,
        bueroAnsprechpartnerId: w.bueroAnsprechpartnerId || null,
        mitarbeiterIds: w.mitarbeiterIds,
      });
      if (r.fehler) setFehler(r.fehler);
      else router.push(`/buero/projekte/${r.id}`);
    });
  }

  const aktuellerStatus = status.find((s) => s.id === w.statusId) ?? status[0];
  const gewaehltePersonen = w.mitarbeiterIds.map((uid) => personen.find((p) => p.id === uid)).filter((p): p is { id: string; name: string } => Boolean(p));

  return (
    <form onSubmit={speichern} className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href={zurueck} aria-label="Zurück" className="flex size-8 items-center justify-center rounded-md border bg-white hover:bg-muted">
          <ArrowLeftIcon className="size-4" />
        </Link>
        <h1 className="text-[15px] font-semibold">{id ? "Projekt bearbeiten" : "Neues Projekt"}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" className="h-8 px-3 text-[13px]" onClick={() => router.push(zurueck)} disabled={laeuft}>Abbrechen</Button>
          <Button type="submit" className="h-8 px-3 text-[13px]" disabled={laeuft || !w.name.trim()}>{laeuft ? "Speichern …" : id ? "Speichern" : "Projekt erstellen"}</Button>
        </div>
      </div>

      {fehler && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{fehler}</p>}

      <Abschnitt titel="Allgemein">
        <Zeile label="Projektname*" htmlFor="name"><input id="name" {...feld("name")} maxLength={120} placeholder="Projektname" className={EINGABE} /></Zeile>
        <Zeile label="Start / Ende">
          <div className="grid grid-cols-2 gap-2">
            <DatumWahl wert={w.startDatum} onAendern={(d) => setW((alt) => ({ ...alt, startDatum: d }))} platzhalter="Start" heute={heute} />
            <DatumWahl wert={w.endDatum} onAendern={(d) => setW((alt) => ({ ...alt, endDatum: d }))} platzhalter="Ende" heute={heute} />
          </div>
        </Zeile>
        <Zeile label="Beschreibung" htmlFor="beschreibung">
          <textarea id="beschreibung" rows={3} maxLength={2000} {...feld("beschreibung")} placeholder="Beschreibung" className={cn(EINGABE, "h-auto min-h-16 py-1.5")} />
        </Zeile>
        <Zeile
          label="Projektnummer"
          htmlFor="projektnummer"
          hinweis={!id && !w.projektnummer.trim() && vorschlag ? <span className="font-medium text-primary">{vorschlag} wird vergeben</span> : null}
        >
          <input id="projektnummer" {...feld("projektnummer")} maxLength={40} placeholder="Projektnummer" className={EINGABE} />
        </Zeile>
        <Zeile label="Projektstatus">
          <Popover>
            <PopoverTrigger className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-label="Projektstatus wählen">
              {aktuellerStatus && <StatusPille name={aktuellerStatus.name} farbe={aktuellerStatus.farbe} className="pr-1.5" />}
              <ChevronDownIcon className="-ml-1.5 size-3 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1">
              <ul>
                {status.map((s) => (
                  <li key={s.id}>
                    <PopoverClose render={<button type="button" />} onClick={() => setW((alt) => ({ ...alt, statusId: s.id }))} className="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-muted">
                      <StatusPille name={s.name} farbe={s.farbe} />
                    </PopoverClose>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </Zeile>
        <Zeile label="Büro-Kontakt" htmlFor="buero">
          <select id="buero" value={w.bueroAnsprechpartnerId} onChange={(e) => setW((alt) => ({ ...alt, bueroAnsprechpartnerId: e.target.value }))} className={EINGABE}>
            <option value="">– keiner –</option>
            {buero.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Zeile>
      </Abschnitt>

      <Abschnitt titel="Mitarbeiter">
        <div className="flex flex-col gap-2">
          <div className="max-w-72">
            <Popover>
              <PopoverTrigger className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-white px-2.5 text-left text-[13px] text-muted-foreground hover:bg-muted data-popup-open:border-ring">
                <span className="flex-1">Durchsuche deine Mitarbeiter</span>
                <ChevronDownIcon className="size-3.5" />
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0">
                <MehrfachListe
                  optionen={personen.map((p) => ({ id: p.id, text: p.name }))}
                  gewaehlt={w.mitarbeiterIds}
                  onAendern={(ids) => setW((alt) => ({ ...alt, mitarbeiterIds: ids }))}
                />
              </PopoverContent>
            </Popover>
          </div>
          {gewaehltePersonen.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {gewaehltePersonen.map((p) => (
                <li key={p.id} className="flex items-center gap-1.5 rounded-full border bg-white py-0.5 pr-1.5 pl-1 text-[13px]">
                  <span className="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold text-neutral-800" style={{ backgroundColor: personKreis(p.name).farbe }}>{personKreis(p.name).initialen}</span>
                  {p.name}
                  <button type="button" aria-label={`${p.name} entfernen`} onClick={() => setW((alt) => ({ ...alt, mitarbeiterIds: alt.mitarbeiterIds.filter((x) => x !== p.id) }))} className="text-muted-foreground hover:text-foreground">
                    <XIcon className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Abschnitt>

      <Abschnitt titel="Kunde">
        <div className="max-w-72">
          {w.kunde ? (
            <div className="flex items-center justify-between gap-2 rounded-md border bg-white px-2.5 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{w.kunde.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{[w.kunde.kundennummer, [w.kunde.strasse, [w.kunde.plz, w.kunde.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
              </span>
              <button type="button" aria-label="Kunde entfernen" onClick={() => setW((alt) => ({ ...alt, kunde: null }))} className="text-muted-foreground hover:text-foreground"><XIcon className="size-4" /></button>
            </div>
          ) : (
            <Popover onOpenChange={(offen) => !offen && sucheAendern("")}>
              <PopoverTrigger className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-white px-2.5 text-left text-[13px] text-muted-foreground hover:bg-muted data-popup-open:border-ring">
                <span className="flex-1">Kunde aus Kontakte auswählen</span>
                <ChevronDownIcon className="size-3.5" />
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0">
                <div className="p-2 pb-1">
                  <label className="flex items-center gap-2 rounded-md border border-ring/60 px-2 ring-2 ring-ring/20">
                    <SearchIcon className="size-3.5 text-muted-foreground" />
                    <input autoFocus aria-label="Kunde suchen" value={suche} onChange={(e) => sucheAendern(e.target.value)} placeholder="Name, Ort, Straße oder Nummer …" className="h-8 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
                  </label>
                </div>
                <ul className="max-h-64 overflow-y-auto p-1">
                  {treffer.map((k) => (
                    <li key={k.id}>
                      <PopoverClose render={<button type="button" />} onClick={() => kundeWaehlen(k)} className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted">
                        <span className="text-[13px] font-medium">{k.name}</span>
                        <span className="text-xs text-muted-foreground">{[k.kundennummer, [k.strasse, k.ort].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
                      </PopoverClose>
                    </li>
                  ))}
                  {suche.trim().length < 2 && <li className="px-2 py-3 text-center text-[13px] text-muted-foreground">Mindestens 2 Buchstaben eintippen</li>}
                  {suche.trim().length >= 2 && treffer.length === 0 && <li className="px-2 py-3 text-center text-[13px] text-muted-foreground">Kein Kunde gefunden. Zuerst unter Kontakte anlegen.</li>}
                </ul>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </Abschnitt>

      <Abschnitt titel="Baustellenadresse" zusatz={<span className="font-normal text-muted-foreground">(Leistungsort)</span>}>
        <AdressFelder werte={{ strasse: w.strasse, plz: w.plz, ort: w.ort, land: w.land }} onChange={(a) => { setW((alt) => ({ ...alt, ...a })); setFehler(null); }} />
        {w.kunde && (w.kunde.strasse || w.kunde.ort) && (
          <div className="sm:pl-36">
            <Button type="button" variant="outline" className="h-8 px-3 text-[13px]" onClick={() => setW((alt) => ({ ...alt, strasse: w.kunde!.strasse, plz: w.kunde!.plz, ort: w.kunde!.ort, land: w.kunde!.land }))}>
              Adresse vom Kunden übernehmen
            </Button>
          </div>
        )}
      </Abschnitt>
    </form>
  );
}
