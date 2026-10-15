"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, SaveIcon, TruckIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Auswahl } from "@/components/feld";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tageVerschieben } from "@/lib/datum";
import type { EinteilungsGruppe } from "@/lib/einteilung-erkennung";
import { formatDatumLang } from "@/lib/format";
import { einsaetzeSpeichern, wieGestern, type EinsatzKarte } from "./actions";
import { Spracheingabe } from "./spracheingabe";

export type Fahrzeug = { id: string; name: string; kennzeichen: string | null };
export type ProjektOption = { id: string; name: string; ort: string; aktuell: boolean; stichworte: string[] };
export type Person = { id: string; vorname: string; nachname: string };
export type EinsatzDaten = EinsatzKarte;

const OHNE = "ohne";
const schluesselVon = (vehicleId: string | null) => vehicleId ?? OHNE;

export function Einteilung({
  datum,
  heute,
  fahrzeuge,
  projekte,
  mitarbeiter,
  einsaetze,
}: {
  datum: string;
  heute: string;
  fahrzeuge: Fahrzeug[];
  projekte: ProjektOption[];
  mitarbeiter: Person[];
  einsaetze: EinsatzDaten[];
}) {
  // Eine Karte pro Auto + eine für "Ohne Firmenwagen"
  const startKarten = useMemo(() => {
    const karten: Record<string, EinsatzKarte> = {};
    for (const f of [...fahrzeuge.map((f) => f.id), null]) {
      const vorhanden = einsaetze.find((e) => e.vehicleId === f);
      karten[schluesselVon(f)] = vorhanden ?? {
        assignmentId: null,
        vehicleId: f,
        projectId: null,
        mitarbeiterIds: [],
        notiz: "",
      };
    }
    return karten;
  }, [fahrzeuge, einsaetze]);

  const [karten, setKarten] = useState(startKarten);
  const [laeuft, starte] = useTransition();

  const geaendert = Object.keys(karten).filter(
    (s) => JSON.stringify(karten[s]) !== JSON.stringify(startKarten[s]),
  );

  const kartenName = (s: string) =>
    s === OHNE ? "Ohne Firmenwagen" : (fahrzeuge.find((f) => f.id === s)?.name ?? "Auto");

  // Wer ist wo eingeteilt? (für den Doppelt-Hinweis)
  const einteilungen = new Map<string, string[]>();
  for (const [s, k] of Object.entries(karten)) {
    for (const id of k.mitarbeiterIds) einteilungen.set(id, [...(einteilungen.get(id) ?? []), s]);
  }

  function aendern(s: string, teil: Partial<EinsatzKarte>) {
    setKarten((alt) => ({ ...alt, [s]: { ...alt[s], ...teil } }));
  }

  function umschalten(s: string, personId: string) {
    const ids = karten[s].mitarbeiterIds;
    aendern(s, { mitarbeiterIds: ids.includes(personId) ? ids.filter((i) => i !== personId) : [...ids, personId] });
  }

  /** Vorschlag aus der Spracheingabe übernehmen (noch nicht speichern). */
  function vorschlagUebernehmen(gruppen: EinteilungsGruppe[]) {
    setKarten((alt) => {
      const neu = structuredClone(alt);
      for (const g of gruppen) {
        const s = schluesselVon(g.fahrzeugId);
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
        if (g.projektId) neu[s].projectId = g.projektId;
      }
      return neu;
    });
    toast.info("Vorschlag übernommen – bitte prüfen und „Alle speichern“ tippen.");
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

  return (
    <div className="flex max-w-5xl flex-col gap-5 pb-24">
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
        daten={{
          mitarbeiter,
          fahrzeuge,
          projekte: projekte.map((p) => ({ id: p.id, name: p.name, stichworte: p.stichworte })),
        }}
        namen={{
          fahrzeug: (id) => fahrzeuge.find((f) => f.id === id)?.name ?? "Ohne Firmenwagen",
          projekt: (id) => projekte.find((p) => p.id === id)?.name ?? "–",
          person: (id) => {
            const p = mitarbeiter.find((m) => m.id === id);
            return p ? `${p.vorname} ${p.nachname}` : "?";
          },
        }}
        onUebernehmen={vorschlagUebernehmen}
      />

      {/* Karten */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Object.keys(karten).map((s) => {
          const karte = karten[s];
          const fahrzeug = fahrzeuge.find((f) => f.id === s);
          const istGeaendert = geaendert.includes(s);
          return (
            <section key={s} className={cn("flex min-w-0 flex-col gap-3 rounded-xl border p-4", istGeaendert && "border-amber-400 bg-amber-50/40")}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  {fahrzeug ? <TruckIcon className="size-5" /> : <UserIcon className="size-5" />}
                  {kartenName(s)}
                  {fahrzeug?.kennzeichen && (
                    <span className="text-sm font-normal text-muted-foreground">{fahrzeug.kennzeichen}</span>
                  )}
                </h2>
                {istGeaendert && <span className="text-xs font-medium text-amber-700">nicht gespeichert</span>}
              </div>

              <Auswahl
                aria-label={`Baustelle für ${kartenName(s)}`}
                value={karte.projectId ?? ""}
                onChange={(e) => aendern(s, { projectId: e.target.value || null })}
              >
                <option value="">– keine Baustelle –</option>
                <optgroup label="In Arbeit / Auftrag erteilt">
                  {aktuelleProjekte.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.ort && ` (${p.ort})`}</option>
                  ))}
                </optgroup>
                <optgroup label="Weitere Projekte">
                  {weitereProjekte.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.ort && ` (${p.ort})`}</option>
                  ))}
                </optgroup>
              </Auswahl>

              <div className="flex flex-wrap gap-2" role="group" aria-label={`Mitarbeiter für ${kartenName(s)}`}>
                {mitarbeiter.map((m) => {
                  const gewaehlt = karte.mitarbeiterIds.includes(m.id);
                  const auchIn = (einteilungen.get(m.id) ?? []).filter((x) => x !== s);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={gewaehlt}
                      onClick={() => umschalten(s, m.id)}
                      className={cn(
                        "min-h-10 rounded-full border px-3 text-sm transition-colors",
                        gewaehlt ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                        gewaehlt && auchIn.length && "border-amber-500 bg-amber-500",
                      )}
                      title={auchIn.length ? `Auch eingeteilt: ${auchIn.map(kartenName).join(", ")}` : undefined}
                    >
                      {m.vorname}
                      {!gewaehlt && auchIn.length > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">({kartenName(auchIn[0])})</span>
                      )}
                      {gewaehlt && auchIn.length > 0 && <span className="ml-1 text-xs">· doppelt!</span>}
                    </button>
                  );
                })}
              </div>

              <Input
                aria-label={`Notiz fürs Team ${kartenName(s)}`}
                placeholder="Notiz fürs Team (z. B. Leiter mitnehmen)"
                value={karte.notiz}
                onChange={(e) => aendern(s, { notiz: e.target.value })}
                className="h-11 text-base"
              />
            </section>
          );
        })}
      </div>

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
  );
}
