"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, HammerIcon, PlayIcon, SquareIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Auswahl } from "@/components/feld";
import { formatDatum, formatStunden, formatUhrzeit } from "@/lib/format";
import { laufzeitText } from "@/lib/stempeluhr";
import { ZEIT_ART_NAMEN, type ZeitArt } from "@/lib/zeiten";
import { ausstempeln, einstempeln, stempeluhrVerwerfen } from "./actions";

export type HeuteEintrag = {
  id: string;
  von: string;
  bis: string;
  stunden: number;
  art: ZeitArt;
  pauseMin: number;
  projekt: string;
};

type Props = {
  heute: string;
  laufend: { projektId: string; gestartetAm: string } | null;
  projekte: { id: string; name: string }[];
  standardProjekt: string;
  eintraege: HeuteEintrag[];
  sollHeute: number;
};

/** Schieber: Den Knopf nach rechts ziehen, ab 85 % löst er aus. Per Tastatur geht Enter/Leertaste. */
function Wischer({ text, aktiv, gesperrt, onFertig }: { text: string; aktiv: boolean; gesperrt: boolean; onFertig: () => void }) {
  const spur = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [zieht, setZieht] = useState(false);
  const [breite, setBreite] = useState(300);
  const KNOPF = 56;
  const maxX = Math.max(1, breite - KNOPF - 8);

  // Breite der Spur merken (ändert sich beim Drehen des Handys)
  useEffect(() => {
    const el = spur.current;
    if (!el) return;
    const messen = () => setBreite(el.clientWidth);
    messen();
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);

  const zuX = (clientX: number) => {
    const links = spur.current?.getBoundingClientRect().left ?? 0;
    return Math.min(maxX, Math.max(0, clientX - links - KNOPF / 2 - 4));
  };

  function los() {
    if (!zieht) return;
    setZieht(false);
    const fertig = x >= maxX * 0.85;
    setX(0);
    if (fertig && !gesperrt) onFertig();
  }

  return (
    <div
      ref={spur}
      className={cn(
        "relative flex h-16 w-full items-center overflow-hidden rounded-full p-1 select-none",
        aktiv ? "bg-red-600/90" : "bg-primary",
        gesperrt && "opacity-50",
      )}
    >
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center pl-12 text-base font-semibold text-white">{text}</span>
      <button
        type="button"
        role="slider"
        aria-label={text}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((x / maxX) * 100)}
        disabled={gesperrt}
        onPointerDown={(e) => {
          if (gesperrt) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setZieht(true);
        }}
        onPointerMove={(e) => zieht && setX(zuX(e.clientX))}
        onPointerUp={los}
        onPointerCancel={los}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !gesperrt) {
            e.preventDefault();
            onFertig();
          }
        }}
        style={{ transform: `translateX(${x}px)`, width: KNOPF, height: KNOPF, transition: zieht ? "none" : "transform 0.2s" }}
        className="relative z-10 flex touch-none items-center justify-center rounded-full bg-white text-foreground shadow"
      >
        {aktiv ? <SquareIcon className="size-6" /> : <PlayIcon className="size-6" />}
      </button>
    </div>
  );
}

export function Stempeluhr({ heute, laufend, projekte, standardProjekt, eintraege, sollHeute }: Props) {
  const router = useRouter();
  const [projektId, setProjektId] = useState(laufend?.projektId ?? standardProjekt);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [laeuft, starte] = useTransition();
  // Unterschied zwischen Handy-Uhr und Server-Uhr ist hier unwichtig: Der Timer ist nur eine Anzeige,
  // gebucht wird mit der Zeit des Servers.
  useEffect(() => {
    const t = setInterval(() => setJetzt(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const gestartet = laufend ? new Date(laufend.gestartetAm).getTime() : null;
  const dauerMs = gestartet ? jetzt - gestartet : 0;
  const projektName = projekte.find((p) => p.id === (laufend?.projektId ?? projektId))?.name ?? "";
  const summe = eintraege.reduce((s, e) => s + e.stunden, 0);

  function stempeln() {
    starte(async () => {
      try {
        const r = laufend ? await ausstempeln() : await einstempeln(projektId || null);
        if (r.fehler) toast.error(r.fehler, { duration: 8000 });
        else if (r.meldung) toast.success(r.meldung, { duration: 8000 });
        router.refresh();
      } catch {
        toast.error("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  function verwerfen() {
    if (!window.confirm("Die laufende Zeit verwerfen? Es wird nichts eingetragen.")) return;
    starte(async () => {
      const r = await stempeluhrVerwerfen();
      if (r.fehler) toast.error(r.fehler);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex justify-center">
        <span className={cn("rounded-full px-4 py-1 text-sm font-medium", laufend ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
          {laufend ? "Eingestempelt" : "Ausgestempelt"}
        </span>
      </div>

      <div className="flex justify-center">
        <div className={cn("flex size-56 flex-col items-center justify-center gap-2 rounded-full border-[10px]", laufend ? "border-primary" : "border-muted")}>
          <HammerIcon className={cn("size-8", laufend ? "text-primary" : "text-muted-foreground")} />
          <p className="text-4xl font-semibold tabular-nums" aria-live="off" suppressHydrationWarning>{laufzeitText(dauerMs)}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <label htmlFor="stempel-projekt" className="text-sm text-muted-foreground">Projekt</label>
        <Auswahl
          id="stempel-projekt"
          value={laufend?.projektId ?? projektId}
          onChange={(e) => setProjektId(e.target.value)}
          disabled={Boolean(laufend) || laeuft}
          className="mt-1 border-0 bg-transparent px-0 text-lg font-medium"
        >
          <option value="">Projekt wählen …</option>
          {projekte.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Auswahl>
        {laufend && projektName && <p className="text-sm text-muted-foreground">Läuft seit {formatUhrzeit(laufend.gestartetAm)} Uhr</p>}
        {projekte.length === 0 && <p className="mt-1 text-sm text-muted-foreground">Du bist noch auf keinem Projekt eingetragen.</p>}
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="font-semibold">Heute, {formatDatum(heute).slice(0, 5)}</h2>
          <p className="text-sm text-muted-foreground">
            {sollHeute > 0 && <>Soll {formatStunden(sollHeute)} · </>}
            <span className="font-medium text-foreground">{formatStunden(summe)}</span>
          </p>
        </div>
        {eintraege.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Heute noch keine Zeit eingetragen.</p>
        ) : (
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
            {eintraege.map((e) => (
              <li key={e.id}>
                <Link href={`/zeiten/${e.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{e.von && e.bis ? `${e.von} – ${e.bis}` : ZEIT_ART_NAMEN[e.art]} <span className="font-normal text-muted-foreground">{e.von ? ZEIT_ART_NAMEN[e.art] : ""}</span></span>
                    <span className="block truncate text-sm text-muted-foreground">{[e.projekt, e.pauseMin > 0 ? `${e.pauseMin} Min. Pause` : ""].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="shrink-0 font-medium">{formatStunden(e.stunden)}</span>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-auto flex flex-col gap-3 pt-2">
        {!laufend && !projektId && <p className="text-center text-sm text-muted-foreground">Bitte zuerst ein Projekt wählen.</p>}
        <Wischer
          text={laufend ? "Zum Ausstempeln wischen" : "Zum Einstempeln wischen"}
          aktiv={Boolean(laufend)}
          gesperrt={laeuft || (!laufend && !projektId)}
          onFertig={stempeln}
        />
        {laufend && (
          <button type="button" onClick={verwerfen} disabled={laeuft} className="text-center text-sm text-muted-foreground underline underline-offset-4">
            Laufende Zeit verwerfen
          </button>
        )}
      </div>
    </div>
  );
}
