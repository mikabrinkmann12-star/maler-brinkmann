"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, MicIcon, SendIcon, SquareIcon } from "lucide-react";
import { cn } from "cn";
import { containerMelden } from "@/app/(mitarbeiter)/container/actions";
import { notizAnlegen } from "@/app/(mitarbeiter)/baustellen/actions";
import { jarvisAbfrage, jarvisDatenLaden, type JarvisAntwort, type JarvisStart } from "@/app/buero/jarvis/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CONTAINER_NAMEN, letzteMeldung, restText, sperreBis } from "@/lib/container";
import { formatDatum } from "@/lib/format";
import { heuteIso, tageVerschieben } from "@/lib/datum";
import { befehlErkennen, JARVIS_BEISPIELE, type JarvisErgebnis } from "@/lib/jarvis-befehle";
import { spracheVerfuegbar, spracherkennungErstellen, sprachFehlerText, type Spracherkennung } from "@/lib/sprache";
import { neueId } from "@/lib/warteschlange";
import { JARVIS_OEFFNEN } from "./buero-kontext";

const keinAbo = () => () => {};

type Ergebnis = { text: string; href?: string; hrefText?: string };

/**
 * Jarvis im Browser (ohne KI): sprechen oder tippen → Befehlserkennung (`befehlErkennen`) → Vorschlag in Klartext.
 * Was etwas ändert (Container melden, Notiz speichern), passiert erst nach „Ja, ausführen“; die Einteilung öffnet nur die
 * Plantafel mit dem Vorschlag. Nachsehen-Fragen ändern nichts und werden gleich beantwortet. Alles mit den Rechten des Nutzers.
 */
export function JarvisDialog() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [start, setStart] = useState<JarvisStart | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [zwischentext, setZwischentext] = useState("");
  const [hoert, setHoert] = useState(false);
  const [sprachFehler, setSprachFehler] = useState<string | null>(null);
  const verfuegbar = useSyncExternalStore(keinAbo, spracheVerfuegbar, () => false);
  const [versuch, setVersuch] = useState(0);
  const [vorschlag, setVorschlag] = useState<JarvisErgebnis | null>(null);
  /** Feste ID für diesen Vorschlag: ein zweites Absenden legt nichts doppelt an. */
  const [aktionsId, setAktionsId] = useState("");
  const [antwort, setAntwort] = useState<JarvisAntwort | null>(null);
  const [fertig, setFertig] = useState<Ergebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const erkennung = useRef<Spracherkennung | null>(null);

  useEffect(() => {
    const auf = () => setOffen(true);
    window.addEventListener(JARVIS_OEFFNEN, auf);
    return () => window.removeEventListener(JARVIS_OEFFNEN, auf);
  }, []);

  // Beim Öffnen die Namenslisten holen (und bei „Nochmal versuchen“ erneut)
  useEffect(() => {
    if (!offen) return;
    let aktuell = true;
    void (async () => {
      try {
        const r = await jarvisDatenLaden();
        if (!aktuell) return;
        if ("fehler" in r) setLadefehler(r.fehler);
        else setStart(r);
      } catch {
        if (aktuell) setLadefehler("Jarvis konnte nicht starten. Bitte nochmal versuchen.");
      }
    })();
    return () => {
      aktuell = false;
    };
  }, [offen, versuch]);

  function zuruecksetzen() {
    erkennung.current?.abort();
    setText("");
    setZwischentext("");
    setHoert(false);
    setSprachFehler(null);
    setVorschlag(null);
    setAntwort(null);
    setFertig(null);
    setFehler(null);
    setLaeuft(false);
  }

  function aendern(neu: boolean) {
    setOffen(neu);
    if (!neu) {
      zuruecksetzen();
      setStart(null);
    }
  }

  async function auswerten(eingabe = text) {
    if (!start || !eingabe.trim()) return;
    setFertig(null);
    setAntwort(null);
    setFehler(null);
    const e = befehlErkennen(eingabe, start.daten);
    setVorschlag(e);
    setAktionsId(neueId());

    // Nachsehen ändert nichts und wird gleich beantwortet
    const b = e.befehl;
    if (b.art === "heute_wo" || b.art === "urlaub_rest" || b.art === "offen") {
      setLaeuft(true);
      try {
        const r = await jarvisAbfrage(b);
        if ("fehler" in r) setFehler(r.fehler);
        else setAntwort(r);
      } catch {
        setFehler("Das hat nicht geklappt. Bitte nochmal versuchen.");
      } finally {
        setLaeuft(false);
      }
    }
  }

  function zuhoerenStarten() {
    const e = spracherkennungErstellen();
    if (!e) return;
    setSprachFehler(null);
    setVorschlag(null);
    setAntwort(null);
    setFertig(null);
    let gesammelt = "";
    e.onresult = (ereignis) => {
      let vorlaeufig = "";
      for (let i = ereignis.resultIndex; i < ereignis.results.length; i++) {
        const r = ereignis.results[i];
        if (r.isFinal) gesammelt += `${r[0].transcript.trim()} `;
        else vorlaeufig += r[0].transcript;
      }
      setText(gesammelt.trim());
      setZwischentext(vorlaeufig);
    };
    e.onerror = (ereignis) => {
      if (ereignis.error !== "aborted") setSprachFehler(sprachFehlerText(ereignis.error));
    };
    e.onend = () => {
      setHoert(false);
      setZwischentext("");
      if (gesammelt.trim()) void auswerten(gesammelt.trim());
    };
    erkennung.current = e;
    setText("");
    e.start();
    setHoert(true);
  }

  async function ausfuehren() {
    if (!vorschlag || !start || laeuft) return;
    const b = vorschlag.befehl;
    setLaeuft(true);
    setFehler(null);
    try {
      if (b.art === "container") {
        const r = await containerMelden(b.container);
        if (r.fehler) return setFehler(r.fehler);
        setFertig({ text: `${CONTAINER_NAMEN[b.container]} ist gemeldet. Das Büro bekommt einen Hinweis; für diese Art gilt jetzt 7 Tage Sperre.`, href: "/buero/container", hrefText: "Container-Meldungen öffnen" });
        const neu = await jarvisDatenLaden();
        if (!("fehler" in neu)) setStart(neu);
      } else if (b.art === "notiz") {
        const r = await notizAnlegen({ id: aktionsId, projektId: b.projektId, text: b.text });
        if (r.fehler) return setFehler(r.fehler);
        setFertig({ text: "Die Notiz ist gespeichert.", href: `/baustellen/${b.projektId}/ablage`, hrefText: "Notizen der Baustelle öffnen" });
      } else if (b.art === "einteilung") {
        const datum = tageVerschieben(heuteIso(), b.tage);
        aendern(false);
        router.push(`/buero/plantafel?datum=${datum}&jarvis=${encodeURIComponent(b.text)}`);
      } else if (b.art === "projekt_oeffnen") {
        aendern(false);
        router.push(`/buero/projekte/${b.projektId}`);
      }
    } catch {
      setFehler("Das hat nicht geklappt. Bitte nochmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  /** Der Nutzer hat bei einer mehrdeutigen Baustelle eine gewählt: daraus wird der eigentliche Vorschlag. */
  function projektWaehlen(projektId: string, dann: NonNullable<Extract<JarvisErgebnis["befehl"], { art: "nachfrage" }>["dann"]>) {
    setAktionsId(neueId());
    setVorschlag({ befehl: dann.art === "notiz" ? { art: "notiz", projektId, text: dann.text } : { art: "projekt_oeffnen", projektId }, hinweise: [] });
  }

  const projekt = (id: string) => start?.daten.projekte.find((p) => p.id === id);
  const projektName = (id: string) => {
    const p = projekt(id);
    return p ? [p.name, p.kunde && p.kunde !== p.name ? p.kunde : "", p.ort].filter(Boolean).join(" · ") : "?";
  };
  const personName = (id: string) => {
    const m = start?.daten.mitarbeiter.find((x) => x.id === id);
    return m ? `${m.vorname} ${m.nachname}`.trim() : "?";
  };
  const autoName = (id: string | null) => start?.daten.fahrzeuge.find((f) => f.id === id)?.name ?? "Ohne Firmenwagen";
  const tagText = (tage: number) => (tage === 0 ? "heute" : tage === 1 ? "morgen" : formatDatum(tageVerschieben(heuteIso(), tage)));

  /** Der Vorschlag in Klartext, dazu ob er ausgeführt werden darf. */
  function vorschlagKarte(v: JarvisErgebnis) {
    const b = v.befehl;
    const erlaubt = start?.erlaubt;
    if (!erlaubt) return null;
    const keinRecht = <p className="text-sm text-destructive">Dafür hast du kein Recht. Das stellt der Admin unter „Rollen & Zugriffsrechte“ ein.</p>;
    const knoepfe = (label: string) => (
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="touch" onClick={ausfuehren} disabled={laeuft}>
          <CheckIcon />
          {laeuft ? "Einen Moment …" : label}
        </Button>
        <Button type="button" size="touch" variant="ghost" onClick={zuruecksetzen} disabled={laeuft}>
          Abbrechen
        </Button>
      </div>
    );

    if (b.art === "container") {
      const bis = sperreBis(start.container, b.container);
      const letzte = letzteMeldung(start.container, b.container);
      return (
        <>
          <p className="font-medium">{CONTAINER_NAMEN[b.container]} melden?</p>
          {!erlaubt.container ? keinRecht : bis ? (
            <p className="text-sm text-amber-800">
              Geht gerade nicht: {letzte ? `${letzte.wer} hat ihn am ${formatDatum(letzte.zeit)} gemeldet` : "Er wurde gerade gemeldet"}. Wieder möglich {restText(bis)} (bis {formatDatum(bis)}).
            </p>
          ) : (
            knoepfe("Ja, ausführen")
          )}
        </>
      );
    }
    if (b.art === "notiz") {
      return (
        <>
          <p className="font-medium">Notiz bei „{projektName(b.projektId)}“ speichern?</p>
          <blockquote className="rounded-md border-l-4 bg-muted/50 px-3 py-2 text-sm">{b.text}</blockquote>
          {erlaubt.notiz ? knoepfe("Ja, ausführen") : keinRecht}
        </>
      );
    }
    if (b.art === "einteilung") {
      return (
        <>
          <p className="font-medium">Einteilung für {tagText(b.tage)} in der Plantafel vorbereiten?</p>
          <ul className="flex flex-col gap-1 text-sm">
            {b.gruppen.map((g, i) => (
              <li key={i}>
                <span className="font-medium">{autoName(g.fahrzeugId)}</span> → {g.projektId ? projektName(g.projektId) : "Baustelle bleibt"}:{" "}
                {g.mitarbeiterIds.length ? g.mitarbeiterIds.map(personName).join(", ") : "Leute bleiben"}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Die Plantafel zeigt den Vorschlag. Gespeichert wird dort erst nach „Übernehmen“ und „Alle speichern“.</p>
          {erlaubt.einteilung ? knoepfe("Ja, Plantafel öffnen") : keinRecht}
        </>
      );
    }
    if (b.art === "projekt_oeffnen") {
      return (
        <>
          <p className="font-medium">Projekt „{projektName(b.projektId)}“ öffnen?</p>
          {erlaubt.projekte ? knoepfe("Ja, öffnen") : keinRecht}
        </>
      );
    }
    if (b.art === "nachfrage") {
      const dann = b.dann;
      return (
        <>
          <p className="text-sm text-amber-800">{b.frage}</p>
          {b.projektIds && dann && (
            <ul className="flex flex-col gap-1.5">
              {b.projektIds.slice(0, 8).map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => projektWaehlen(id, dann)}
                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    {projektName(id)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }
    if (b.art === "unbekannt") return <p className="text-sm">Das habe ich nicht verstanden. Das kann ich:</p>;
    // heute_wo / urlaub_rest / offen: die Antwort steht darunter
    return <p className="font-medium">{b.art === "heute_wo" ? "Ich sehe in der Einteilung nach …" : b.art === "urlaub_rest" ? "Ich sehe den Urlaub nach …" : "Ich sehe nach, was offen ist …"}</p>;
  }

  const eingabe = hoert && zwischentext ? `${text} ${zwischentext}`.trim() : text;

  return (
    <Dialog open={offen} onOpenChange={aendern}>
      <DialogContent className="top-[6%] max-h-[88dvh] translate-y-0 grid-cols-[minmax(0,1fr)] gap-3 overflow-y-auto sm:max-w-xl">
        <DialogTitle className="flex items-center gap-2 text-base">
          <MicIcon className="size-4" /> Jarvis
        </DialogTitle>
        <DialogDescription className="sr-only">Per Sprache oder Text etwas erledigen oder nachsehen.</DialogDescription>

        {ladefehler && (
          <div role="alert" className="flex flex-col gap-2 text-sm text-destructive">
            {ladefehler}
            <Button type="button" variant="outline" onClick={() => { setLadefehler(null); setVersuch((v) => v + 1); }}>Nochmal versuchen</Button>
          </div>
        )}
        {!start && !ladefehler && <p className="text-sm text-muted-foreground">Jarvis wacht auf …</p>}

        {start && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void auswerten();
              }}
              className="flex gap-2"
            >
              {verfuegbar && (
                <Button
                  type="button"
                  size="icon-touch"
                  variant={hoert ? "destructive" : "default"}
                  onClick={hoert ? () => erkennung.current?.stop() : zuhoerenStarten}
                  aria-label={hoert ? "Aufnahme stoppen" : "Sprechen"}
                  className={cn(hoert && "animate-pulse")}
                >
                  {hoert ? <SquareIcon /> : <MicIcon />}
                </Button>
              )}
              <input
                aria-label="Befehl für Jarvis"
                value={eingabe}
                onChange={(e) => setText(e.target.value)}
                placeholder={verfuegbar ? "Mikrofon antippen und sprechen – oder hier tippen" : "Hier tippen (Spracherkennung geht in diesem Browser nicht)"}
                autoFocus={!verfuegbar}
                className="h-12 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button type="submit" size="touch" variant="outline" aria-label="Absenden" disabled={!eingabe.trim() || hoert || laeuft}>
                <SendIcon />
                <span className="hidden sm:inline">Los</span>
              </Button>
            </form>

            {hoert && <p className="text-sm text-muted-foreground">Ich höre zu … zum Beenden das rote Quadrat antippen.</p>}
            {sprachFehler && <p role="alert" className="text-sm text-destructive">{sprachFehler}</p>}

            {vorschlag && !fertig && !(antwort && ["heute_wo", "urlaub_rest", "offen"].includes(vorschlag.befehl.art)) && (
              <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3" aria-live="polite">
                {vorschlagKarte(vorschlag)}
                {vorschlag.hinweise.map((h) => (
                  <p key={h} className="text-sm text-amber-800">⚠ {h}</p>
                ))}
                {(vorschlag.befehl.art === "unbekannt" || (vorschlag.befehl.art === "nachfrage" && !vorschlag.befehl.projektIds)) && <Beispiele onWaehlen={(t) => { setText(t); void auswerten(t); }} />}
              </div>
            )}

            {antwort && (
              <div className="flex flex-col gap-2 rounded-lg border bg-background p-3">
                <p className="font-semibold">{antwort.titel}</p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {antwort.zeilen.map((z) => (
                    <li key={z.text}>
                      {z.href ? (
                        <Link href={z.href} onClick={() => aendern(false)} className="underline underline-offset-2">
                          {z.text}
                        </Link>
                      ) : (
                        z.text
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}

            {fertig && (
              <div className="flex flex-col gap-2 rounded-lg border border-green-600/40 bg-green-50 p-3 text-green-950">
                <p className="flex items-center gap-2 font-medium"><CheckIcon className="size-4" /> {fertig.text}</p>
                <div className="flex flex-wrap gap-2">
                  {fertig.href && (
                    <Link href={fertig.href} onClick={() => aendern(false)} className={buttonVariants({ variant: "outline", size: "lg" })}>
                      {fertig.hrefText}
                    </Link>
                  )}
                  <Button type="button" size="lg" variant="ghost" onClick={zuruecksetzen}>Noch ein Befehl</Button>
                </div>
              </div>
            )}

            {!vorschlag && !fertig && <Beispiele onWaehlen={(t) => { setText(t); void auswerten(t); }} />}

            <p className="text-xs text-muted-foreground">
              Jarvis ist keine KI, sondern erkennt feste Befehle. Die Spracherkennung macht der Browser (Chrome: Google, Safari: Apple), dabei verlässt die Aufnahme das Gerät.
              Etwas ändern passiert erst nach „Ja, ausführen“. Jarvis versendet nichts und löscht nichts.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Beispiele({ onWaehlen }: { onWaehlen: (text: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">Zum Beispiel (antippen zum Ausprobieren):</p>
      <ul className="flex flex-wrap gap-1.5">
        {JARVIS_BEISPIELE.map((b) => (
          <li key={b}>
            <button type="button" onClick={() => onWaehlen(b)} className="rounded-full border bg-background px-3 py-1.5 text-left text-sm hover:bg-muted">
              {b}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
