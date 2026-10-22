"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  MapPinIcon,
  SaveIcon,
  TruckIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Auswahl } from "@/components/feld";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tageVerschieben } from "@/lib/datum";
import { ZEIT_ART_TEXT, stoppVerschieben, type StoppZeitArt } from "@/lib/einsatz";
import type { EinteilungsGruppe } from "@/lib/einteilung-erkennung";
import { formatDatumLang } from "@/lib/format";
import { mapsLink } from "@/lib/projekt";
import {
  OHNE_AUTO,
  kartenSchluessel,
  kartenVonPerson,
  leererStopp,
  personVerschieben,
  stoppHinzufuegen,
  terminUebernehmen,
  type Karte,
  type Karten,
  type TerminFuerPlan,
} from "@/lib/plantafel";
import { einsaetzeSpeichern, fahrzeugHinzufuegen, wieGestern } from "./actions";
import { Spracheingabe } from "./spracheingabe";

export type Fahrzeug = { id: string; name: string; kennzeichen: string | null };
export type ProjektOption = { id: string; name: string; ort: string; adresse: string; aktuell: boolean; stichworte: string[] };
export type Person = { id: string; vorname: string; nachname: string };
export type TerminAnzeige = TerminFuerPlan & { ort: string; zeit: string | null };

/** Adresse einer Baustelle mit Link, der in Google Maps öffnet (auf dem Handy die Navigation). */
function Adresse({ adresse }: { adresse: string }) {
  if (!adresse) return <p className="px-1 text-xs text-muted-foreground">Keine Adresse hinterlegt</p>;
  return (
    <a href={mapsLink({ strasse: adresse }) ?? undefined} target="_blank" rel="noopener noreferrer"
      className="flex w-fit items-center gap-1 px-1 text-sm text-foreground underline underline-offset-4 hover:underline">
      <MapPinIcon className="size-4 shrink-0" />
      {adresse}
      <span className="text-xs text-muted-foreground no-underline">· in Google Maps öffnen</span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Mitarbeiter-Chip (ziehbar)
// ---------------------------------------------------------------------------
function PersonChip({
  person,
  von,
  hinweis,
  warnung,
  gedimmt,
  onEntfernen,
}: {
  person: Person;
  /** Karte, aus der gezogen wird, null = Mitarbeiter-Leiste */
  von: string | null;
  hinweis?: string;
  warnung?: boolean;
  gedimmt?: boolean;
  onEntfernen?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `person:${von ?? "leiste"}:${person.id}`,
    data: { personId: person.id, von },
  });
  return (
    <span
      className={cn(
        "inline-flex min-h-10 items-center gap-1 rounded-full border bg-background pl-1 pr-1 text-sm",
        warnung && "border-amber-500 bg-amber-50",
        gedimmt && "opacity-60",
        isDragging && "opacity-30",
      )}
      title={hinweis}
    >
      <span
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`${person.vorname} verschieben`}
        className="flex min-h-9 cursor-grab touch-none items-center gap-1 rounded-full px-2 active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-3.5 text-muted-foreground" />
        {person.vorname}
        {hinweis && <span className="text-xs text-muted-foreground">({hinweis})</span>}
      </span>
      {onEntfernen && (
        <button type="button" onClick={onEntfernen} aria-label={`${person.vorname} entfernen`}
          className="flex size-8 items-center justify-center rounded-full hover:bg-muted">
          <XIcon className="size-4" />
        </button>
      )}
    </span>
  );
}

function Ablage({ id, className, children }: { id: string; className?: (ueber: boolean) => string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className?.(isOver)}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function Einteilung({
  datum,
  heute,
  fahrzeuge,
  projekte,
  mitarbeiter,
  einsaetze,
  termine,
  abwesend,
  jarvisText,
}: {
  datum: string;
  heute: string;
  fahrzeuge: Fahrzeug[];
  projekte: ProjektOption[];
  mitarbeiter: Person[];
  einsaetze: Karte[];
  termine: TerminAnzeige[];
  /** Person → Grund der Abwesenheit (Urlaub, Krank) */
  abwesend: Record<string, string>;
  /** Satz von Jarvis: wird gleich ausgewertet und als Vorschlag gezeigt (gespeichert wird erst nach „Übernehmen“ und „Alle speichern“) */
  jarvisText?: string;
}) {
  // Eine Karte pro Auto + eine für "Ohne Firmenwagen"
  const startKarten = useMemo(() => {
    const karten: Karten = {};
    for (const f of [...fahrzeuge.map((f) => f.id), null]) {
      karten[kartenSchluessel(f)] = einsaetze.find((e) => e.vehicleId === f) ?? {
        assignmentId: null,
        vehicleId: f,
        stopps: [],
        mitarbeiterIds: [],
        notiz: "",
      };
    }
    return karten;
  }, [fahrzeuge, einsaetze]);

  const [autos, setAutos] = useState<Fahrzeug[]>(fahrzeuge);
  const [karten, setKarten] = useState(startKarten);
  const [neuesAuto, setNeuesAuto] = useState<string | null>(null);
  const [autoFehler, setAutoFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const [ziehe, setZiehe] = useState<Person | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const kartenReihenfolge = [...autos.map((a) => a.id), OHNE_AUTO];
  const leereKarte = (s: string): Karte => ({ assignmentId: null, vehicleId: s === OHNE_AUTO ? null : s, stopps: [], mitarbeiterIds: [], notiz: "" });
  const geaendert = kartenReihenfolge.filter(
    (s) => JSON.stringify(karten[s]) !== JSON.stringify(startKarten[s] ?? leereKarte(s)),
  );

  const kartenName = (s: string) =>
    s === OHNE_AUTO ? "Ohne Firmenwagen" : (autos.find((f) => f.id === s)?.name ?? "Auto");
  const person = (id: string) => mitarbeiter.find((m) => m.id === id);
  const projektName = (id: string) => projekte.find((p) => p.id === id)?.name ?? "Baustelle";

  const einteilungen = kartenVonPerson(karten);
  const termineVonPerson = new Map<string, string[]>();
  for (const t of termine) for (const id of t.personIds) termineVonPerson.set(id, [...(termineVonPerson.get(id) ?? []), t.titel]);

  function aendern(s: string, teil: Partial<Karte>) {
    setKarten((alt) => ({ ...alt, [s]: { ...alt[s], ...teil } }));
  }

  function stoppAendern(s: string, index: number, teil: Partial<Karte["stopps"][number]>) {
    aendern(s, { stopps: karten[s].stopps.map((st, i) => (i === index ? { ...st, ...teil } : st)) });
  }

  function zeitSetzen(s: string, index: number, zeit: string) {
    const st = karten[s].stopps[index];
    stoppAendern(s, index, zeit ? { zeit, zeitArt: st.zeitArt ?? "um" } : { zeit: null, zeitArt: null });
  }

  function dragStart(e: DragStartEvent) {
    setZiehe(person(String(e.active.data.current?.personId)) ?? null);
  }

  function dragEnd(e: DragEndEvent) {
    setZiehe(null);
    const daten = e.active.data.current as { personId: string; von: string | null } | undefined;
    if (!daten || !e.over) return;
    const ziel = String(e.over.id);
    if (ziel === "leiste") {
      if (daten.von) setKarten((alt) => personVerschieben(alt, daten.personId, daten.von, null));
    } else if (ziel.startsWith("karte:")) {
      const nach = ziel.slice("karte:".length);
      if (nach !== daten.von) setKarten((alt) => personVerschieben(alt, daten.personId, daten.von, nach));
    }
  }

  /** Vorschlag aus der Spracheingabe übernehmen (noch nicht speichern). */
  function vorschlagUebernehmen(gruppen: EinteilungsGruppe[]) {
    setKarten((alt) => {
      let neu = structuredClone(alt);
      for (const g of gruppen) {
        const s = kartenSchluessel(g.fahrzeugId);
        if (!neu[s]) continue;
        // Genannte Leute aus anderen Karten herausnehmen (sie "wechseln" das Auto)
        if (g.mitarbeiterIds.length) {
          for (const andere of Object.keys(neu)) {
            if (andere !== s) {
              neu[andere].mitarbeiterIds = neu[andere].mitarbeiterIds.filter((id) => !g.mitarbeiterIds.includes(id));
            }
          }
          neu[s].mitarbeiterIds = g.mitarbeiterIds;
        }
        if (g.projektId) neu = stoppHinzufuegen(neu, s, g.projektId);
      }
      return neu;
    });
    toast.info("Vorschlag übernommen – bitte prüfen und „Alle speichern“ tippen.");
  }

  function termineUebernehmen(t: TerminAnzeige, s: string) {
    if (!s) return;
    setKarten((alt) => terminUebernehmen(alt, s, t));
    toast.info(`„${t.titel}“ ist in ${kartenName(s)} übernommen – bitte prüfen und speichern.`);
  }

  function autoHinzufuegen(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    if (neuesAuto === null) return;
    starte(async () => {
      const r = await fahrzeugHinzufuegen(neuesAuto);
      if (r.fehler || !r.auto) return setAutoFehler(r.fehler ?? "Das hat nicht geklappt.");
      const auto = r.auto;
      // Neue Karte ergänzen, ohne ungespeicherte Änderungen an den anderen Karten zu verlieren
      setAutos((alt) => (alt.some((a) => a.id === auto.id) ? alt : [...alt, auto]));
      setKarten((alt) => (alt[auto.id] ? alt : { ...alt, [auto.id]: leereKarte(auto.id) }));
      setNeuesAuto(null);
      setAutoFehler(null);
      toast.success(r.hinweis ?? `${auto.name} ist hinzugefügt.`);
    });
  }

  function speichern() {
    starte(async () => {
      const ergebnis = await einsaetzeSpeichern(datum, geaendert.map((s) => karten[s]));
      if (ergebnis.fehler) toast.error(ergebnis.fehler);
      else toast.success("Einteilung gespeichert");
    });
  }

  function gesternUebernehmen() {
    if (geaendert.length && !window.confirm("Ungespeicherte Änderungen gehen verloren. Trotzdem übernehmen?")) return;
    starte(async () => {
      const ergebnis = await wieGestern(datum);
      if (ergebnis.fehler) toast.error(ergebnis.fehler);
      else toast.info(ergebnis.hinweis);
    });
  }

  const aktuelleProjekte = projekte.filter((p) => p.aktuell);
  const weitereProjekte = projekte.filter((p) => !p.aktuell);
  const projektOptionen = (ausser: string[], aktuell?: string) => (
    <>
      <optgroup label="In Arbeit / Auftrag erteilt">
        {aktuelleProjekte.filter((p) => p.id === aktuell || !ausser.includes(p.id)).map((p) => (
          <option key={p.id} value={p.id}>{p.name}{p.ort && ` (${p.ort})`}</option>
        ))}
      </optgroup>
      <optgroup label="Weitere Projekte">
        {weitereProjekte.filter((p) => p.id === aktuell || !ausser.includes(p.id)).map((p) => (
          <option key={p.id} value={p.id}>{p.name}{p.ort && ` (${p.ort})`}</option>
        ))}
      </optgroup>
    </>
  );

  return (
    <DndContext sensors={sensors} onDragStart={dragStart} onDragEnd={dragEnd} onDragCancel={() => setZiehe(null)}>
      <div className="flex flex-col gap-5 pb-24">
        {/* Kopf: Datum + Aktionen */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Einteilung</h1>
            <p className="text-muted-foreground">
              {formatDatumLang(datum)}
              {datum === heute && " · heute"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`?datum=${tageVerschieben(datum, -1)}`} aria-label="Vortag"
              className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
              <ChevronLeftIcon />
            </Link>
            {datum !== heute && (
              <Link href={`?datum=${heute}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                Heute
              </Link>
            )}
            <Link href={`?datum=${tageVerschieben(datum, 1)}`} aria-label="Folgetag"
              className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
              <ChevronRightIcon />
            </Link>
            <Button type="button" variant="outline" size="lg" onClick={gesternUebernehmen} disabled={laeuft}>
              <CopyIcon />
              Wie gestern
            </Button>
          </div>
        </div>

        <Spracheingabe
          startText={jarvisText}
          daten={{
            mitarbeiter,
            fahrzeuge: autos,
            projekte: projekte.map((p) => ({ id: p.id, name: p.name, stichworte: p.stichworte })),
          }}
          namen={{
            fahrzeug: (id) => autos.find((f) => f.id === id)?.name ?? "Ohne Firmenwagen",
            projekt: (id) => projekte.find((p) => p.id === id)?.name ?? "–",
            person: (id) => {
              const p = person(id);
              return p ? `${p.vorname} ${p.nachname}` : "?";
            },
          }}
          onUebernehmen={vorschlagUebernehmen}
        />

        {/* Termine des Tages */}
        {termine.length > 0 && (
          <section className="flex flex-col gap-2 rounded-xl border border-sky-300 bg-sky-50/60 p-4">
            <h2 className="flex items-center gap-2 font-semibold"><CalendarClockIcon className="size-5" /> Termine an diesem Tag</h2>
            <ul className="flex flex-col divide-y divide-sky-200">
              {termine.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t.zeit && `${t.zeit} Uhr · `}{t.titel}
                      {t.projectId && <span className="font-normal text-muted-foreground"> · {projektName(t.projectId)}</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t.personIds.map((id) => person(id)?.vorname).filter(Boolean).join(", ") || "niemand zugeordnet"}
                    </p>
                    <Adresse adresse={t.ort || (t.projectId ? projekte.find((p) => p.id === t.projectId)?.adresse ?? "" : "")} />
                  </div>
                  <Auswahl aria-label={`„${t.titel}“ in Auto übernehmen`} value="" className="w-52"
                    onChange={(e) => termineUebernehmen(t, e.target.value)}>
                    <option value="">In Auto übernehmen …</option>
                    {kartenReihenfolge.map((s) => <option key={s} value={s}>{kartenName(s)}</option>)}
                  </Auswahl>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Mitarbeiter-Leiste: von hier auf eine Karte ziehen */}
        <Ablage id="leiste" className={(ueber) => cn("flex flex-col gap-2 rounded-xl border bg-muted/40 p-3", ueber && "border-primary bg-primary/5")}>
          <p className="text-sm font-medium">Mitarbeiter <span className="font-normal text-muted-foreground">– auf eine Karte ziehen (hierher zurück = herausnehmen)</span></p>
          <div className="flex flex-wrap gap-2">
            {mitarbeiter.map((m) => {
              const wo = (einteilungen.get(m.id) ?? []).map(kartenName);
              const grund = abwesend[m.id];
              const tn = termineVonPerson.get(m.id);
              const text = [grund, tn?.length ? `Termin: ${tn.join(", ")}` : "", wo.length ? wo.join(" + ") : ""].filter(Boolean).join(" · ");
              return (
                <PersonChip key={m.id} person={m} von={null} hinweis={text || undefined}
                  warnung={Boolean(grund)} gedimmt={wo.length > 0 && !grund} />
              );
            })}
          </div>
        </Ablage>

        {/* Karten */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {kartenReihenfolge.map((s) => {
            const karte = karten[s];
            const fahrzeug = autos.find((f) => f.id === s);
            const istGeaendert = geaendert.includes(s);
            const verwendet = karte.stopps.map((st) => st.projectId);
            return (
              <Ablage key={s} id={`karte:${s}`}
                className={(ueber) => cn("flex min-w-0 flex-col gap-3 rounded-xl border p-4",
                  istGeaendert && "border-amber-400 bg-amber-50/40", ueber && "ring-2 ring-primary")}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 font-semibold">
                    {fahrzeug ? <TruckIcon className="size-5" /> : <UserIcon className="size-5" />}
                    {kartenName(s)}
                    {fahrzeug?.kennzeichen && fahrzeug.kennzeichen !== fahrzeug.name && (
                      <span className="text-sm font-normal text-muted-foreground">{fahrzeug.kennzeichen}</span>
                    )}
                  </h2>
                  {istGeaendert && <span className="text-xs font-medium text-amber-700">nicht gespeichert</span>}
                </div>

                {/* Team */}
                <div className="flex min-h-11 flex-wrap items-center gap-2" role="group" aria-label={`Mitarbeiter für ${kartenName(s)}`}>
                  {karte.mitarbeiterIds.map((id) => {
                    const p = person(id);
                    if (!p) return null;
                    const auchIn = (einteilungen.get(id) ?? []).filter((x) => x !== s);
                    const grund = abwesend[id];
                    return (
                      <PersonChip key={id} person={p} von={s}
                        warnung={auchIn.length > 0 || Boolean(grund)}
                        hinweis={grund ?? (auchIn.length ? `doppelt: ${auchIn.map(kartenName).join(", ")}` : undefined)}
                        onEntfernen={() => setKarten((alt) => personVerschieben(alt, id, s, null))} />
                    );
                  })}
                  {karte.mitarbeiterIds.length === 0 && <span className="text-sm text-muted-foreground">Niemand eingeteilt</span>}
                  <Auswahl aria-label={`Mitarbeiter zu ${kartenName(s)} hinzufügen`} value="" className="h-10 w-44 text-sm"
                    onChange={(e) => e.target.value && setKarten((alt) => personVerschieben(alt, e.target.value, null, s))}>
                    <option value="">+ Mitarbeiter …</option>
                    {mitarbeiter.filter((m) => !karte.mitarbeiterIds.includes(m.id)).map((m) => (
                      <option key={m.id} value={m.id}>{m.vorname} {m.nachname}</option>
                    ))}
                  </Auswahl>
                </div>

                {/* Baustellen (Stopps) */}
                <div className="flex flex-col gap-2">
                  {karte.stopps.map((st, i) => (
                    <div key={st.projectId} className="flex flex-col gap-2 rounded-lg border bg-background p-2">
                      <div className="flex items-center gap-2">
                        <Auswahl aria-label={`Baustelle ${i + 1} für ${kartenName(s)}`} value={st.projectId}
                          onChange={(e) => stoppAendern(s, i, { projectId: e.target.value })}>
                          {projektOptionen(verwendet, st.projectId)}
                        </Auswahl>
                        <Button type="button" variant="ghost" size="icon-lg" aria-label="Baustelle nach oben" disabled={i === 0}
                          onClick={() => aendern(s, { stopps: stoppVerschieben(karte.stopps, i, -1) })}>
                          <ArrowUpIcon />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-lg" aria-label="Baustelle nach unten" disabled={i === karte.stopps.length - 1}
                          onClick={() => aendern(s, { stopps: stoppVerschieben(karte.stopps, i, 1) })}>
                          <ArrowDownIcon />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-touch" aria-label="Baustelle entfernen"
                          onClick={() => aendern(s, { stopps: karte.stopps.filter((_, n) => n !== i) })}>
                          <XIcon />
                        </Button>
                      </div>
                      <Adresse adresse={projekte.find((p) => p.id === st.projectId)?.adresse ?? ""} />
                      <div className="flex flex-wrap items-center gap-2">
                        <Input type="time" aria-label="Uhrzeit (optional)" value={st.zeit ?? ""}
                          onChange={(e) => zeitSetzen(s, i, e.target.value)} className="h-10 w-32 text-base" />
                        {st.zeit ? (
                          <Auswahl aria-label="Art der Zeit" value={st.zeitArt ?? "um"} className="h-10 w-44 text-sm"
                            onChange={(e) => stoppAendern(s, i, { zeitArt: e.target.value as StoppZeitArt })}>
                            {(Object.keys(ZEIT_ART_TEXT) as StoppZeitArt[]).map((a) => (
                              <option key={a} value={a}>{ZEIT_ART_TEXT[a]}</option>
                            ))}
                          </Auswahl>
                        ) : (
                          <span className="text-xs text-muted-foreground">ohne Zeit: Team entscheidet die Reihenfolge</span>
                        )}
                        <Input aria-label="Hinweis zur Baustelle (optional)" placeholder="Hinweis (optional)" maxLength={200}
                          value={st.notiz} onChange={(e) => stoppAendern(s, i, { notiz: e.target.value })}
                          className="h-10 min-w-40 flex-1 text-base" />
                      </div>
                    </div>
                  ))}
                  <Auswahl aria-label={`Baustelle zu ${kartenName(s)} hinzufügen`} value=""
                    onChange={(e) => e.target.value && aendern(s, { stopps: [...karte.stopps, leererStopp(e.target.value)] })}>
                    <option value="">{karte.stopps.length ? "+ Weitere Baustelle …" : "+ Baustelle wählen …"}</option>
                    {projektOptionen(verwendet)}
                  </Auswahl>
                </div>

                <Input
                  aria-label={`Notiz fürs Team ${kartenName(s)}`}
                  placeholder="Notiz fürs Team (z. B. Leiter mitnehmen)"
                  value={karte.notiz}
                  onChange={(e) => aendern(s, { notiz: e.target.value })}
                  className="h-11 text-base"
                />
              </Ablage>
            );
          })}
        </div>

        {/* Neues Auto */}
        {neuesAuto === null ? (
          <Button type="button" variant="outline" size="touch" className="w-fit" onClick={() => setNeuesAuto("")}>
            <TruckIcon /> Auto hinzufügen
          </Button>
        ) : (
          <form onSubmit={autoHinzufuegen} className="flex max-w-md flex-col gap-2 rounded-xl border p-4">
            <label htmlFor="neues-kennzeichen" className="font-medium">Kennzeichen des neuen Autos</label>
            <div className="flex gap-2">
              <Input id="neues-kennzeichen" value={neuesAuto} autoFocus placeholder="z. B. CLP-AB 123" autoCapitalize="characters"
                onChange={(e) => { setNeuesAuto(e.target.value); setAutoFehler(null); }} className="h-12 flex-1 text-base uppercase" />
              <Button type="submit" size="touch" disabled={laeuft || !neuesAuto.trim()}>Hinzufügen</Button>
              <Button type="button" variant="ghost" size="touch" onClick={() => { setNeuesAuto(null); setAutoFehler(null); }}>Abbrechen</Button>
            </div>
            {autoFehler && <p role="alert" className="text-sm text-destructive">{autoFehler}</p>}
          </form>
        )}

        {/* Speichern-Leiste, sobald es Änderungen gibt */}
        {geaendert.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 backdrop-blur md:left-64">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
              <span className="text-sm">
                {geaendert.length} {geaendert.length === 1 ? "Karte geändert" : "Karten geändert"}
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="lg" onClick={() => setKarten(startKarten)} disabled={laeuft}>
                  Verwerfen
                </Button>
                <Button type="button" size="lg" onClick={speichern} disabled={laeuft}>
                  <SaveIcon />
                  {laeuft ? "Speichern …" : "Alle speichern"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {ziehe && (
          <span className="inline-flex min-h-10 items-center gap-1 rounded-full border bg-background px-3 text-sm shadow-lg">
            <GripVerticalIcon className="size-3.5" /> {ziehe.vorname}
          </span>
        )}
      </DragOverlay>
    </DndContext>
  );
}
