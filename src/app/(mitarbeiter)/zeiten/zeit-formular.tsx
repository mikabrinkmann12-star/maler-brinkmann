"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tageVerschieben } from "@/lib/datum";
import { formatDatumLang, formatStunden, formatTagKurz, formatZahl } from "@/lib/format";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { stundenEingabeLesen, zeitDatenSchema, type ZeitDaten } from "@/lib/zeit-schema";
import {
  MAX_PAUSE_MIN,
  ZEIT_ARTEN,
  ZEIT_ART_NAMEN,
  arbeitsMinuten,
  brauchtProjekt,
  projektVorschlag,
  tagesStandard,
  ueberschneidetSich,
  vorschlagFuerTag,
  type ZeitArt,
} from "@/lib/zeiten";
import type { ZeitFormularDaten } from "@/lib/zeiten-daten";
import { neueId } from "@/lib/warteschlange";
import { auftragSenden } from "../senden";

const PAUSEN = [0, 15, 30, 45, 60];

export type BestehenderEintrag = {
  id: string;
  datum: string;
  projektId: string | null;
  art: ZeitArt;
  modus: "uhrzeit" | "stunden";
  von: string;
  bis: string;
  pauseMin: number;
  stunden: number;
  beschreibung: string;
};

/** Auswahl-Knopf (Art, Pause, Tag): groß genug für Finger mit Handschuh. */
function Wahl({ an, onClick, children, className, "aria-label": label }: {
  an: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Button type="button" variant={an ? "default" : "outline"} size="touch" aria-pressed={an} aria-label={label}
      onClick={onClick} className={cn("px-3", className)}>
      {children}
    </Button>
  );
}

/**
 * Zeit eintragen bzw. ändern. Normalfall in 2 Taps: Baustelle und Zeiten sind
 * vorausgefüllt (Einsatz des Tages + Standardzeiten), dann „Speichern“.
 */
export function ZeitFormular({
  daten,
  bestehend,
  startProjektId,
}: {
  daten: ZeitFormularDaten;
  bestehend?: BestehenderEintrag;
  startProjektId?: string;
}) {
  const router = useRouter();
  const { einstellungen: e, ich } = daten;
  const projektIds = useMemo(() => daten.projekte.map((p) => p.id), [daten.projekte]);
  const arten: ZeitArt[] = daten.darfAlles ? [...ZEIT_ARTEN] : e.erlaubteArten;
  const namen = useMemo(() => new Map(daten.personen.map((p) => [p.id, p])), [daten.personen]);

  const andereEintraege = (tag: string) => daten.eintraege.filter((t) => t.datum === tag && t.id !== bestehend?.id);
  const zeitVorschlag = (tag: string) =>
    vorschlagFuerTag(
      andereEintraege(tag).map((t) => ({ von: t.von || null, bis: t.bis || null, pause_min: t.pauseMin })),
      tagesStandard(tag, e),
    );
  const baustelleVorschlag = (tag: string) =>
    startProjektId && projektIds.includes(startProjektId)
      ? startProjektId
      : projektVorschlag(tag, daten.einsaetze, daten.eintraege, projektIds);

  const startDatum = bestehend?.datum ?? daten.heute;
  const startZeit = bestehend ?? zeitVorschlag(startDatum);
  const [datum, setDatum] = useState(startDatum);
  const [art, setArt] = useState<ZeitArt>(bestehend?.art ?? (arten.includes("arbeitszeit") ? "arbeitszeit" : arten[0]));
  const [projektId, setProjektId] = useState(bestehend ? (bestehend.projektId ?? "") : baustelleVorschlag(startDatum));
  const [modus, setModus] = useState<"uhrzeit" | "stunden">(bestehend?.modus ?? "uhrzeit");
  const [von, setVon] = useState(startZeit.von);
  const [bis, setBis] = useState(startZeit.bis);
  const [pauseMin, setPauseMin] = useState(startZeit.pauseMin);
  const [anderePause, setAnderePause] = useState(!PAUSEN.includes(startZeit.pauseMin));
  const [stundenText, setStundenText] = useState(bestehend?.modus === "stunden" ? formatZahl(bestehend.stunden) : "");
  const [beschreibung, setBeschreibung] = useState(bestehend?.beschreibung ?? "");
  const [kollegen, setKollegen] = useState<string[]>([]);
  const [zeitGeaendert, setZeitGeaendert] = useState(Boolean(bestehend));
  const [projektGeaendert, setProjektGeaendert] = useState(Boolean(bestehend || startProjektId));
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  // --- abgeleitete Werte ----------------------------------------------------
  const projekt = daten.projekte.find((p) => p.id === projektId);
  const eingeteilteIds = new Set(daten.einsaetze.filter((x) => x.datum === datum).map((x) => x.projektId));
  const heutigeProjekte = daten.projekte.filter((p) => eingeteilteIds.has(p.id));
  const weitereProjekte = daten.projekte.filter((p) => !eingeteilteIds.has(p.id));
  const einsatzTeam = new Set(daten.einsaetze.filter((x) => x.datum === datum && x.projektId === projektId).flatMap((x) => x.team));
  const kollegenAuswahl = (daten.mitglieder[projektId] ?? [])
    .map((id) => namen.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .sort((a, b) => Number(einsatzTeam.has(b.id)) - Number(einsatzTeam.has(a.id)) || a.name.localeCompare(b.name, "de"));

  const stundenWert = stundenEingabeLesen(stundenText);
  const rechnung = modus === "uhrzeit" ? arbeitsMinuten(von, bis, pauseMin) : null;
  const minuten = rechnung ? ("minuten" in rechnung ? rechnung.minuten : null) : stundenWert != null ? Math.round(stundenWert * 60) : null;
  const tagesEintraege = andereEintraege(datum);
  const konflikt = modus === "uhrzeit" && rechnung && "minuten" in rechnung
    ? tagesEintraege.find((t) => t.von && t.bis && ueberschneidetSich({ von, bis }, { von: t.von, bis: t.bis }))
    : undefined;
  const gestern = tageVerschieben(daten.heute, -1);
  const gesternErlaubt = !daten.minDatum || gestern >= daten.minDatum;

  // --- Änderungen -------------------------------------------------------------
  function tagWaehlen(tag: string) {
    if (!tag) return;
    setDatum(tag);
    setFehler(null);
    if (bestehend) return;
    if (!zeitGeaendert) {
      const v = zeitVorschlag(tag);
      setVon(v.von);
      setBis(v.bis);
      setPauseMin(v.pauseMin);
      setAnderePause(!PAUSEN.includes(v.pauseMin));
    }
    if (!projektGeaendert) setProjektId(baustelleVorschlag(tag));
    setKollegen([]);
  }

  function zeitAendern(setzen: () => void) {
    setzen();
    setZeitGeaendert(true);
    setFehler(null);
  }

  function kollegeUmschalten(id: string) {
    setKollegen((alt) => (alt.includes(id) ? alt.filter((k) => k !== id) : [...alt, id]));
  }

  function eingabe(): ZeitDaten {
    return {
      datum,
      projektId: projektId || null,
      art,
      modus,
      von: modus === "uhrzeit" ? von : "",
      bis: modus === "uhrzeit" ? bis : "",
      pauseMin: modus === "uhrzeit" ? pauseMin : 0,
      stunden: modus === "stunden" ? (stundenWert ?? 0) : 0,
      beschreibung,
    };
  }

  function titel(): string {
    const wo = projekt?.name ?? ZEIT_ART_NAMEN[art];
    return `${formatTagKurz(datum)} · ${minuten != null ? formatStunden(minuten / 60) : ""} · ${wo}`;
  }

  async function abschicken(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    if (sendet) return;
    const werte = eingabe();
    const pruefung = zeitDatenSchema.safeParse(werte);
    if (!pruefung.success) {
      setFehler(ersteMeldung(pruefung.error));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSendet(true);
    setFehler(null);
    const auftrag = bestehend
      ? { schluessel: `aendern:${bestehend.id}`, typ: "zeit_aendern", titel: `Änderung: ${titel()}`, nutzlast: { id: bestehend.id, daten: werte } }
      : (() => {
          const personen = [ich.id, ...kollegen].map((userId) => ({ eintragId: neueId(), userId }));
          const mit = kollegen.length ? ` · mit ${kollegen.map((k) => namen.get(k)?.vorname).join(", ")}` : "";
          return { schluessel: personen[0].eintragId, typ: "zeit_anlegen", titel: titel() + mit, nutzlast: { daten: werte, personen } };
        })();

    const r = await auftragSenden(ich.id, auftrag, { abgelehntBehalten: false });
    setSendet(false);

    if (r.status === "abgelehnt") {
      setFehler(r.fehler);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (r.status === "wartet") {
      toast.warning("Keine Verbindung. Der Eintrag liegt sicher auf dem Handy und wird automatisch gesendet.", { duration: 8000 });
      if (!bestehend) {
        // Formular für den nächsten Eintrag frisch machen – der alte wartet oben.
        setKollegen([]);
        setBeschreibung("");
      }
    } else {
      const fuer = !bestehend && kollegen.length ? ` für dich und ${kollegen.length === 1 ? "1 Kollegen" : `${kollegen.length} Kollegen`}` : "";
      toast.success(`Gespeichert${fuer}: ${titel()}`);
      router.push(`/zeiten?datum=${datum}`);
    }
  }

  async function loeschen() {
    if (!bestehend || sendet) return;
    if (!window.confirm("Diesen Eintrag wirklich löschen?")) return;
    setSendet(true);
    const r = await auftragSenden(
      ich.id,
      { schluessel: `archivieren:${bestehend.id}`, typ: "zeit_archivieren", titel: `Löschen: ${titel()}`, nutzlast: { id: bestehend.id } },
      { abgelehntBehalten: false },
    );
    setSendet(false);
    if (r.status === "abgelehnt") setFehler(r.fehler);
    else if (r.status === "wartet") toast.warning("Keine Verbindung. Das Löschen wird automatisch nachgeholt.");
    else {
      toast.success("Eintrag gelöscht.");
      router.push(`/zeiten?datum=${bestehend.datum}`);
    }
  }

  // --- Anzeige ----------------------------------------------------------------
  return (
    <form onSubmit={abschicken} className="flex flex-col gap-6">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      {/* Tag */}
      <Feld label="Tag" htmlFor="datum" hinweis={formatDatumLang(datum)}>
        <div className="grid grid-cols-[1fr_1fr_9rem] gap-2">
          <Wahl an={datum === daten.heute} onClick={() => tagWaehlen(daten.heute)}>Heute</Wahl>
          {gesternErlaubt && <Wahl an={datum === gestern} onClick={() => tagWaehlen(gestern)}>Gestern</Wahl>}
          <Input id="datum" type="date" value={datum} required
            min={daten.minDatum ?? undefined} max={daten.maxDatum ?? undefined}
            onChange={(ev) => tagWaehlen(ev.target.value)}
            className={cn("h-12 text-base", !gesternErlaubt && "col-span-2")} />
        </div>
      </Feld>

      {/* Art */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-base font-medium">Art</legend>
        <div className="grid grid-cols-2 gap-2">
          {arten.map((a) => (
            <Wahl key={a} an={art === a} onClick={() => { setArt(a); setFehler(null); }}>{ZEIT_ART_NAMEN[a]}</Wahl>
          ))}
        </div>
      </fieldset>

      {/* Baustelle */}
      <Feld label={brauchtProjekt(art) ? "Baustelle" : "Baustelle (optional)"} htmlFor="projekt"
        hinweis={daten.projekte.length === 0 ? "Du bist noch auf keiner Baustelle eingetragen. Frag im Büro nach." : undefined}>
        <Auswahl id="projekt" value={projektId} onChange={(ev) => {
          setProjektId(ev.target.value);
          setProjektGeaendert(true);
          setKollegen([]);
          setFehler(null);
        }}>
          <option value="">{brauchtProjekt(art) ? "Bitte wählen …" : "Keine Baustelle"}</option>
          {heutigeProjekte.length > 0 && (
            <optgroup label={datum === daten.heute ? "Heute eingeteilt" : "An dem Tag eingeteilt"}>
              {heutigeProjekte.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ort ? ` · ${p.ort}` : ""}</option>)}
            </optgroup>
          )}
          {weitereProjekte.length > 0 && (
            <optgroup label={heutigeProjekte.length ? "Weitere Baustellen" : "Meine Baustellen"}>
              {weitereProjekte.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ort ? ` · ${p.ort}` : ""}</option>)}
            </optgroup>
          )}
        </Auswahl>
      </Feld>

      {/* Zeit */}
      <div className="flex flex-col gap-4" role="group" aria-labelledby="zeit-titel">
        <div className="flex items-center justify-between gap-3">
          <p id="zeit-titel" className="text-base font-medium">Zeit</p>
          <div className="grid grid-cols-2 rounded-lg border p-0.5 text-sm" role="group" aria-label="Eingabe als">
            {(["uhrzeit", "stunden"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={modus === m}
                onClick={() => zeitAendern(() => {
                  // Beim Wechsel auf „Nur Stunden“ die schon berechnete Zeit übernehmen
                  if (m === "stunden" && !stundenText && minuten != null) setStundenText(formatZahl(minuten / 60));
                  setModus(m);
                })}
                className={cn("h-10 rounded-md px-3", modus === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {m === "uhrzeit" ? "Von–bis" : "Nur Stunden"}
              </button>
            ))}
          </div>
        </div>

        {modus === "uhrzeit" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Feld label="Von" htmlFor="von">
                <Input id="von" type="time" required value={von} step={300}
                  onChange={(ev) => zeitAendern(() => setVon(ev.target.value))} className="h-12 text-lg" />
              </Feld>
              <Feld label="Bis" htmlFor="bis">
                <Input id="bis" type="time" required value={bis} step={300}
                  onChange={(ev) => zeitAendern(() => setBis(ev.target.value))} className="h-12 text-lg" />
              </Feld>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-base font-medium" id="pause-titel">Pause (Minuten)</p>
              <div className="grid grid-cols-6 gap-2" role="group" aria-labelledby="pause-titel">
                {PAUSEN.map((p) => (
                  <Wahl key={p} className="px-0" an={!anderePause && pauseMin === p}
                    onClick={() => zeitAendern(() => { setPauseMin(p); setAnderePause(false); })}>
                    {p}
                  </Wahl>
                ))}
                <Wahl className="px-0" an={anderePause} aria-label="Andere Pause" onClick={() => zeitAendern(() => setAnderePause(true))}>
                  …
                </Wahl>
              </div>
              {anderePause && (
                <Input type="number" inputMode="numeric" min={0} max={MAX_PAUSE_MIN} step={5} aria-label="Pause in Minuten"
                  value={String(pauseMin)} autoFocus
                  onChange={(ev) => zeitAendern(() => setPauseMin(Math.max(0, Math.round(Number(ev.target.value) || 0))))}
                  className="h-12 w-32 text-base" />
              )}
            </div>
          </>
        ) : (
          <Feld label="Stunden" htmlFor="stunden" hinweis="z. B. 8 oder 7,5 oder 7:30">
            <Input id="stunden" inputMode="decimal" required value={stundenText} placeholder="8"
              onChange={(ev) => zeitAendern(() => setStundenText(ev.target.value))} className="h-12 w-40 text-lg" />
          </Feld>
        )}

        {rechnung && "fehler" in rechnung && von && bis && (
          <p className="text-sm text-destructive">{rechnung.fehler}</p>
        )}
        {konflikt && (
          <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            Überschneidet sich mit {konflikt.von}–{konflikt.bis}{konflikt.projektName ? ` (${konflikt.projektName})` : ""}.
          </p>
        )}
        {tagesEintraege.length > 0 && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">Schon eingetragen an dem Tag:</p>
            <ul>
              {tagesEintraege.map((t) => (
                <li key={t.id}>
                  {t.von ? `${t.von}–${t.bis}` : ZEIT_ART_NAMEN[t.art]} · {t.projektName || ZEIT_ART_NAMEN[t.art]} · {formatStunden(t.stunden)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Kollegen mit eintragen */}
      {!bestehend && projektId && kollegenAuswahl.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 flex items-center gap-2 text-base font-medium">
            <UsersIcon className="size-5" /> Auch für Kollegen eintragen
          </legend>
          <p className="text-sm text-muted-foreground">Gleiche Zeit für alle Angekreuzten. Jeder kann seinen Eintrag danach selbst ändern.</p>
          <ul className="flex flex-col gap-2">
            {kollegenAuswahl.map((k) => (
              <li key={k.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 has-checked:border-primary has-checked:bg-primary/5">
                  <input type="checkbox" className="size-5 accent-primary" checked={kollegen.includes(k.id)}
                    onChange={() => kollegeUmschalten(k.id)} />
                  <span className="flex-1">{k.name}</span>
                  {einsatzTeam.has(k.id) && <span className="text-sm text-muted-foreground">im Einsatz</span>}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {/* Beschreibung */}
      <Feld label="Beschreibung (Leistung, Material, …)" htmlFor="beschreibung" hinweis="Optional: was wurde gemacht, welches Material wurde gebraucht.">
        <textarea id="beschreibung" rows={2} maxLength={500} value={beschreibung}
          onChange={(ev) => setBeschreibung(ev.target.value)}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      </Feld>

      {/* Speichern – bleibt über der unteren Navigation sichtbar */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex flex-col gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <p className="text-center text-sm text-muted-foreground" role="status">
          {minuten != null ? <strong className="text-foreground">{formatStunden(minuten / 60)}</strong> : "Zeit fehlt"}
          {" · "}{projekt?.name ?? ZEIT_ART_NAMEN[art]}
          {kollegen.length > 0 && ` · +${kollegen.length} ${kollegen.length === 1 ? "Kollege" : "Kollegen"}`}
        </p>
        <Button type="submit" size="touch" className="w-full" disabled={sendet}>
          {sendet ? "Speichern …" : bestehend ? "Änderung speichern" : "Speichern"}
        </Button>
      </div>

      {bestehend && (
        <Button type="button" variant="destructive" size="touch" className="w-full" onClick={loeschen} disabled={sendet}>
          <Trash2Icon /> Eintrag löschen
        </Button>
      )}
    </form>
  );
}
