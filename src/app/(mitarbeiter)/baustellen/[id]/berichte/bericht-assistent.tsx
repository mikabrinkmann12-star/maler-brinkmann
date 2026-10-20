"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CheckCircle2Icon, CheckIcon, ChevronRightIcon, CircleIcon, DownloadIcon, FileTextIcon, PlusIcon, SaveIcon, SquareIcon, CheckSquareIcon, Trash2Icon, XIcon } from "lucide-react";
import { cn } from "cn";
import { BerichtAnzeige, type AnzeigeInfo } from "@/components/bericht-anzeige";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { buttonVariants, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BERICHT_DEFS, MAX_FOTOS, TEXT_MAX, type Abschnitt, type BerichtArt, type EinfachesFeld, type Feld as FeldDef } from "@/lib/bericht-arten";
import {
  WETTER, WETTER_NAMEN, abschnittAusgefuellt, unterschriftPfad, zahlText,
  type BerichtDaten, type EintragWerte, type FeldWert, type Wetter,
} from "@/lib/bericht";
import { formatDatum } from "@/lib/format";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { berichtAbschliessen, berichtArchivieren, berichtSpeichern } from "../../bericht-actions";
import { UnterschriftFeld } from "./unterschrift-feld";

type Person = { id: string; name: string };
type Foto = { id: string; vorschauUrl: string | null; bildUrl: string | null; wann: string };

const AREA = "w-full rounded-lg border bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Zahl aus der Eingabe (deutsches Komma erlaubt); leer oder unlesbar → null. */
function zahlLesen(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Einzelne Felder
// ---------------------------------------------------------------------------
function EinfachFeld({ f, wert, personen, aendern, idPrefix }: {
  f: EinfachesFeld;
  wert: string | number | null | undefined;
  personen: Person[];
  aendern: (w: string | number | null) => void;
  idPrefix: string;
}) {
  const id = `${idPrefix}-${f.schluessel}`;
  switch (f.art) {
    case "text":
      return (
        <Feld label={f.label} htmlFor={id}>
          <textarea id={id} value={String(wert ?? "")} onChange={(e) => aendern(e.target.value)} maxLength={f.max ?? TEXT_MAX} rows={f.zeilen ?? 3} placeholder={f.platzhalter} className={AREA} />
        </Feld>
      );
    case "zahl":
      return (
        <Feld label={f.label} htmlFor={id}>
          <Input id={id} inputMode="decimal" defaultValue={zahlText(typeof wert === "number" ? wert : null)} onChange={(e) => aendern(zahlLesen(e.target.value))} placeholder={f.platzhalter} className="h-12 text-base" />
        </Feld>
      );
    case "datum":
      return (
        <Feld label={f.label} htmlFor={id}>
          <Input id={id} type="date" value={String(wert ?? "")} onChange={(e) => aendern(e.target.value)} className="h-12 text-base" />
        </Feld>
      );
    case "auswahl":
      return (
        <Feld label={f.label} htmlFor={id}>
          <Auswahl id={id} value={String(wert ?? "")} onChange={(e) => aendern(e.target.value)}>
            <option value="">Bitte wählen …</option>
            {f.optionen.map((o) => <option key={o.wert} value={o.wert}>{o.name}</option>)}
          </Auswahl>
        </Feld>
      );
    case "person":
      return (
        <Feld label={f.label} htmlFor={id}>
          <Auswahl id={id} value={String(wert ?? "")} onChange={(e) => aendern(e.target.value)}>
            <option value="">Bitte wählen …</option>
            {personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Auswahl>
        </Feld>
      );
  }
}

function FeldBlock({ f, werte, setWert, personen, fotos, abschnittId }: {
  f: FeldDef;
  werte: Record<string, FeldWert>;
  setWert: (schluessel: string, w: FeldWert) => void;
  personen: Person[];
  fotos: Foto[];
  abschnittId: string;
}) {
  const w = werte[f.schluessel];

  if (f.art === "festtext") return <p className="rounded-xl border bg-muted/40 p-4 text-base">{f.text}</p>;

  if (f.art === "auswahl" && f.optionen.length <= 3) {
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-medium">{f.label}</legend>
        {f.optionen.map((o) => {
          const an = w === o.wert;
          return (
            <button key={o.wert} type="button" role="radio" aria-checked={an} onClick={() => setWert(f.schluessel, o.wert)}
              className={cn("flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-2 text-left text-base", an && "border-primary")}>
              {an ? <CheckCircle2Icon className="size-6 shrink-0 text-primary" /> : <CircleIcon className="size-6 shrink-0 text-muted-foreground" />}
              {o.name}
            </button>
          );
        })}
      </fieldset>
    );
  }

  if (f.art === "checkliste") {
    const an = Array.isArray(w) ? (w as string[]) : [];
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-medium">{f.label}</legend>
        {f.punkte.map((p) => {
          const gesetzt = an.includes(p.wert);
          return (
            <button key={p.wert} type="button" role="checkbox" aria-checked={gesetzt}
              onClick={() => setWert(f.schluessel, gesetzt ? an.filter((x) => x !== p.wert) : [...an, p.wert])}
              className={cn("flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-2 text-left text-base", gesetzt && "border-primary")}>
              {gesetzt ? <CheckSquareIcon className="size-6 shrink-0 text-primary" /> : <SquareIcon className="size-6 shrink-0 text-muted-foreground" />}
              {p.name}
            </button>
          );
        })}
      </fieldset>
    );
  }

  if (f.art === "liste") {
    const eintraege = Array.isArray(w) ? (w as EintragWerte[]) : [];
    const leer = (): EintragWerte => Object.fromEntries(f.eintrag.map((e) => [e.schluessel, e.art === "zahl" ? null : ""]));
    return (
      <div className="flex flex-col gap-3">
        {eintraege.map((e, i) => (
          <section key={`${i}/${eintraege.length}`} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-muted-foreground">{f.label} {i + 1}</h3>
              <button type="button" aria-label={`Eintrag ${i + 1} entfernen`} onClick={() => setWert(f.schluessel, eintraege.filter((_, n) => n !== i))}
                className="flex size-10 items-center justify-center rounded-full text-red-600 hover:bg-red-50">
                <Trash2Icon className="size-5" />
              </button>
            </div>
            {f.eintrag.map((ef) => (
              <EinfachFeld key={ef.schluessel} f={ef} wert={e[ef.schluessel]} personen={personen} idPrefix={`${abschnittId}-${i}`}
                aendern={(neu) => setWert(f.schluessel, eintraege.map((x, n) => (n === i ? { ...x, [ef.schluessel]: neu } : x)))} />
            ))}
          </section>
        ))}
        {eintraege.length < f.max && (
          <Button type="button" variant="outline" size="touch" onClick={() => setWert(f.schluessel, [...eintraege, leer()])}>
            <PlusIcon /> {f.hinzufuegen}
          </Button>
        )}
      </div>
    );
  }

  if (f.art === "bilder") {
    const gewaehlt = Array.isArray(w) ? (w as string[]) : [];
    const umschalten = (id: string) =>
      setWert(f.schluessel, gewaehlt.includes(id) ? gewaehlt.filter((x) => x !== id) : gewaehlt.length < MAX_FOTOS ? [...gewaehlt, id] : gewaehlt);
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-medium">Bilder ({gewaehlt.length}/{MAX_FOTOS})</legend>
        {fotos.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Fotos auf dieser Baustelle. Fotos machst du unter „Ablage“ oder im Chat, danach kannst du sie hier auswählen.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {fotos.map((x) => {
              const an = gewaehlt.includes(x.id);
              return (
                <li key={x.id}>
                  <button type="button" aria-pressed={an} aria-label={`Foto vom ${x.wann}`} onClick={() => umschalten(x.id)}
                    className={cn("relative block aspect-square w-full overflow-hidden rounded-lg border-2", an ? "border-primary" : "border-transparent")}>
                    {x.vorschauUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.vorschauUrl} alt="" className="size-full object-cover" />
                    )}
                    {an && <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckIcon className="size-4" /></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
    );
  }

  return (
    <EinfachFeld f={f} wert={w as string | number | null | undefined} personen={personen} idPrefix={abschnittId}
      aendern={(neu) => setWert(f.schluessel, neu)} />
  );
}

// ---------------------------------------------------------------------------
// Der Assistent
// ---------------------------------------------------------------------------
type Schritt = "uebersicht" | "vorschau" | number;

/**
 * Bericht in Abschnitten schreiben (wie in Plancraft): Liste der Abschnitte → je Abschnitt „Zurück/Weiter“ → Vorschau → abschließen.
 * Bei jedem „Weiter“ wird der Entwurf gespeichert (die ID erzeugt die App, mehrfaches Speichern ist unschädlich).
 * Bei einem Fehler bleibt alles stehen.
 */
export function BerichtAssistent({
  projektId, berichtId: berichtIdStart, art, startDatum, start, gespeichertStart, info, personen, fotos,
}: {
  projektId: string;
  berichtId: string;
  art: BerichtArt;
  startDatum: string;
  start: BerichtDaten;
  gespeichertStart: boolean;
  info: AnzeigeInfo;
  personen: Person[];
  fotos: Foto[];
}) {
  const router = useRouter();
  // Die ID bleibt für die ganze Sitzung gleich, auch wenn die Seite vom Server neu geladen wird
  const [berichtId] = useState(berichtIdStart);
  const def = BERICHT_DEFS[art];
  const [datum, setDatum] = useState(startDatum);
  const [allgemein, setAllgemein] = useState(start.allgemein);
  const [werte, setWerte] = useState(start.werte);
  const [schritt, setSchritt] = useState<Schritt>("uebersicht");
  const [gespeichert, setGespeichert] = useState(gespeichertStart);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [png, setPng] = useState<Blob | null>(null);
  const [abschlussOffen, setAbschlussOffen] = useState(false);
  const [frageEntfernen, setFrageEntfernen] = useState(false);

  const daten: BerichtDaten = { allgemein, werte };
  const titel = `${def.name} - ${formatDatum(datum)}`;
  const abschnitte = def.abschnitte;
  const setWert = (schluessel: string, w: FeldWert) => setWerte((alt) => ({ ...alt, [schluessel]: w }));
  const personName = (id: string) => personen.find((p) => p.id === id)?.name ?? "Ehemaliger Kollege";

  async function speichern(): Promise<boolean> {
    const r = await berichtSpeichern({ id: berichtId, projektId, art, datum, daten });
    if (r.fehler) {
      setFehler(r.fehler);
      return false;
    }
    setGespeichert(true);
    return true;
  }

  /** Speichern und weiter; ohne Netz bleibt man stehen und die Eingaben bleiben erhalten. */
  async function weiter(ziel: Schritt) {
    setLaeuft(true);
    setFehler(null);
    try {
      if (await speichern()) {
        setSchritt(ziel);
        window.scrollTo({ top: 0 });
      }
    } catch {
      setFehler("Das hat nicht geklappt (Netz?). Dein Bericht bleibt hier stehen, bitte nochmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  async function speichernUndSchliessen() {
    setLaeuft(true);
    setFehler(null);
    try {
      if (await speichern()) router.push(`/baustellen/${projektId}/berichte`);
    } catch {
      setFehler("Das hat nicht geklappt (Netz?). Dein Bericht bleibt hier stehen, bitte nochmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  async function entfernen() {
    setLaeuft(true);
    setFehler(null);
    try {
      if (gespeichert) {
        const r = await berichtArchivieren(berichtId, projektId);
        if (r.fehler) return setFehler(r.fehler);
      }
      router.push(`/baustellen/${projektId}/berichte`);
    } catch {
      setFehler("Das hat nicht geklappt (Netz?). Bitte nochmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  async function abschliessen() {
    if (png && !name.trim()) return setFehler("Bitte den Namen des Unterschreibenden angeben.");
    setLaeuft(true);
    setFehler(null);
    try {
      if (!(await speichern())) return;
      if (png) {
        const { error } = await createBrowserSupabase().storage
          .from("berichtunterschriften")
          .upload(unterschriftPfad(projektId, berichtId), png, { contentType: "image/png", upsert: false });
        // „schon vorhanden“ = ein früherer Versuch hat die Unterschrift schon hochgeladen
        if (error && !/already exists|duplicate/i.test(error.message)) return setFehler("Die Unterschrift konnte nicht hochgeladen werden. Bitte nochmal versuchen (Netz prüfen).");
      }
      const r = await berichtAbschliessen({ id: berichtId, projektId, unterschrift: png ? { name } : null });
      if (r.fehler) return setFehler(r.fehler);
      router.push(`/baustellen/${projektId}/berichte/${berichtId}`);
    } catch {
      setFehler("Das hat nicht geklappt (Netz?). Dein Bericht bleibt hier stehen, bitte nochmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  const kopf = (text: string, zurueck: () => void, rechts?: React.ReactNode) => (
    <div className="grid grid-cols-[3rem_1fr_3rem] items-center">
      <button type="button" aria-label="Zurück" onClick={zurueck} className="-ml-2 flex size-12 items-center justify-center rounded-full hover:bg-muted">
        <ArrowLeftIcon className="size-6" />
      </button>
      <h1 className="truncate text-center text-lg font-semibold">{text}</h1>
      <div className="flex justify-end">{rechts}</div>
    </div>
  );

  // --- Übersicht: Liste der Abschnitte ---------------------------------------------------------------------
  if (schritt === "uebersicht") {
    return (
      <div className="flex flex-col gap-4">
        {kopf(titel, () => router.push(`/baustellen/${projektId}/berichte`), (
          <button type="button" aria-label="Bericht verwerfen" onClick={() => setFrageEntfernen(true)} className="-mr-2 flex size-12 items-center justify-center rounded-full text-red-600 hover:bg-red-50">
            <Trash2Icon className="size-5" />
          </button>
        ))}
        {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
        {frageEntfernen && (
          <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-4">
            <p>Diesen Bericht verwerfen?</p>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" size="touch" className="flex-1" disabled={laeuft} onClick={() => void entfernen()}>Verwerfen</Button>
              <Button type="button" variant="ghost" size="touch" onClick={() => setFrageEntfernen(false)}>Abbrechen</Button>
            </div>
          </div>
        )}
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
          {abschnitte.map((a, i) => {
            const fertig = abschnittAusgefuellt(art, a, daten);
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setSchritt(i)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted">
                  {fertig ? <CheckCircle2Icon className="size-6 shrink-0 text-primary" /> : <CircleIcon className="size-6 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 text-base font-medium">{a.titel}</span>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
        <Button type="button" size="touch" disabled={laeuft} onClick={() => void weiter("vorschau")}>
          <FileTextIcon /> {laeuft ? "Wird gespeichert …" : "Vorschau"}
        </Button>
      </div>
    );
  }

  // --- Vorschau ----------------------------------------------------------------------------------------------
  if (schritt === "vorschau") {
    return (
      <div className="flex flex-col gap-4">
        {kopf("Vorschau", () => setSchritt("uebersicht"))}
        {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
        <p className="text-center text-lg font-semibold">{titel}</p>
        <BerichtAnzeige art={art} datum={datum} daten={daten} info={{ ...info, erstelltVon: allgemein.erstelltVon ? personName(allgemein.erstelltVon) : "" }} personName={personName} fotos={fotos} />

        {gespeichert && (
          <a href={`/baustellen/${projektId}/berichte/${berichtId}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}>
            <DownloadIcon /> PDF ansehen (Entwurf)
          </a>
        )}

        {abschlussOffen ? (
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <h2 className="text-lg font-semibold">Bericht abschließen</h2>
            <p className="text-sm text-muted-foreground">Danach kann der Bericht nicht mehr geändert werden. Die Unterschrift des Kunden ist freiwillig.</p>
            <Feld label="Name des Unterschreibenden" htmlFor="unterschrift-name">
              <Input id="unterschrift-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="z. B. Frau Müller" className="h-12 text-base" />
            </Feld>
            <UnterschriftFeld onChange={setPng} />
            <Button type="button" size="touch" disabled={laeuft} onClick={() => void abschliessen()}>
              <CheckIcon /> {laeuft ? "Wird gespeichert …" : png ? "Mit Unterschrift abschließen" : "Ohne Unterschrift abschließen"}
            </Button>
            <Button type="button" variant="ghost" size="touch" disabled={laeuft} onClick={() => setAbschlussOffen(false)}>Zurück zum Bericht</Button>
          </section>
        ) : (
          <div className="flex flex-col gap-2">
            <Button type="button" size="touch" disabled={laeuft} onClick={() => setAbschlussOffen(true)}>
              <CheckIcon /> Abschließen …
            </Button>
            <Button type="button" variant="outline" size="touch" disabled={laeuft} onClick={() => void speichernUndSchliessen()}>
              <SaveIcon /> {laeuft ? "Wird gespeichert …" : "Als Entwurf speichern"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // --- Ein Abschnitt ----------------------------------------------------------------------------------------
  const nr = schritt;
  const ab: Abschnitt = abschnitte[nr];
  const letzter = nr === abschnitte.length - 1;
  return (
    <div className="flex flex-col gap-4">
      {kopf(ab.titel, () => setSchritt("uebersicht"), (
        <button type="button" aria-label="Zur Übersicht" onClick={() => setSchritt("uebersicht")} className="-mr-2 flex size-12 items-center justify-center rounded-full hover:bg-muted"><XIcon className="size-5" /></button>
      ))}
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      {ab.id === "allgemein" ? (
        <AllgemeinFelder def={def.allgemein} info={info} datum={datum} setDatum={setDatum} allgemein={allgemein} setAllgemein={setAllgemein} personen={personen} />
      ) : (
        ab.felder.map((f) => <FeldBlock key={f.schluessel} f={f} werte={werte} setWert={setWert} personen={personen} fotos={fotos} abschnittId={ab.id} />)
      )}

      <div className="mt-2 grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" size="touch" disabled={laeuft} onClick={() => (nr === 0 ? setSchritt("uebersicht") : setSchritt(nr - 1))}>
          Zurück
        </Button>
        <Button type="button" size="touch" disabled={laeuft} onClick={() => void weiter(letzter ? "vorschau" : nr + 1)}>
          {laeuft ? "Speichern …" : letzter ? "Zur Vorschau" : "Weiter"}
        </Button>
      </div>
    </div>
  );
}

function Fest({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-base font-medium">{label}</p>
      <p className="min-h-12 whitespace-pre-line rounded-lg bg-muted px-3 py-3 text-base text-muted-foreground">{text || "–"}</p>
    </div>
  );
}

function AllgemeinFelder({ def, info, datum, setDatum, allgemein, setAllgemein, personen }: {
  def: { zeitraum?: boolean; wetter?: boolean; erstelltVon?: boolean };
  info: AnzeigeInfo;
  datum: string;
  setDatum: (d: string) => void;
  allgemein: BerichtDaten["allgemein"];
  setAllgemein: (a: BerichtDaten["allgemein"]) => void;
  personen: Person[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Fest label="Auftragnehmer" text={info.auftragnehmer} />
      <Fest label="Auftraggeber" text={info.auftraggeber} />
      <Fest label="Projektname" text={info.projekt} />
      <Fest label="Leistungsort" text={info.leistungsort} />
      <Feld label="Datum" htmlFor="a-datum">
        <Input id="a-datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="h-12 text-base" />
      </Feld>
      {def.zeitraum && (
        <div className="grid grid-cols-2 gap-3">
          <Feld label="Leistungszeitraum von" htmlFor="a-von">
            <Input id="a-von" type="date" value={allgemein.von} onChange={(e) => setAllgemein({ ...allgemein, von: e.target.value })} className="h-12 text-base" />
          </Feld>
          <Feld label="bis" htmlFor="a-bis">
            <Input id="a-bis" type="date" value={allgemein.bis} onChange={(e) => setAllgemein({ ...allgemein, bis: e.target.value })} className="h-12 text-base" />
          </Feld>
        </div>
      )}
      {def.wetter && (
        <div className="grid grid-cols-2 gap-3">
          <Feld label="Wetterbedingung" htmlFor="a-wetter">
            <Auswahl id="a-wetter" value={allgemein.wetter ?? ""} onChange={(e) => setAllgemein({ ...allgemein, wetter: (e.target.value || null) as Wetter | null })}>
              <option value="">–</option>
              {WETTER.map((w) => <option key={w} value={w}>{WETTER_NAMEN[w]}</option>)}
            </Auswahl>
          </Feld>
          <Feld label="Temperatur (°C)" htmlFor="a-temp">
            <Input id="a-temp" inputMode="numeric" defaultValue={allgemein.temperatur === null ? "" : String(allgemein.temperatur)}
              onChange={(e) => { const z = zahlLesen(e.target.value); setAllgemein({ ...allgemein, temperatur: z === null ? null : Math.round(z) }); }}
              placeholder="z. B. 12" className="h-12 text-base" />
          </Feld>
        </div>
      )}
      {def.erstelltVon && (
        <Feld label="Erstellt von" htmlFor="a-von-person">
          <Auswahl id="a-von-person" value={allgemein.erstelltVon} onChange={(e) => setAllgemein({ ...allgemein, erstelltVon: e.target.value })}>
            <option value="">Bitte wählen …</option>
            {personen.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Auswahl>
        </Feld>
      )}
    </div>
  );
}
