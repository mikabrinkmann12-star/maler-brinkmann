"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronRightIcon, FolderIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { formatBetrag } from "@/lib/format";
import { KATALOG_ART_NAMEN, type KatalogArt } from "@/lib/katalog";
import { katalogOrdnerInhalt, katalogSuchen, positionAusKatalog, type KatalogTreffer } from "../actions";

type OrdnerAnsicht = { pfad: { id: string; name: string }[]; unterordner: { id: string; name: string }[]; treffer: KatalogTreffer[] };

/**
 * Katalog durchblättern (Ordner anklicken wie im Katalog) oder durchsuchen und Einträge als Positionen ins Angebot kopieren
 * (Menge 1, Verkaufspreis; im Angebot änderbar). Beim Tippen in die Suche wird über alle Ordner gesucht.
 */
export function KatalogAuswahl({
  angebotId,
  nachId,
  onSchliessen,
}: {
  angebotId: string;
  nachId: string | null;
  onSchliessen: () => void;
}) {
  const router = useRouter();
  const [art, setArt] = useState<KatalogArt>("leistung");
  const [q, setQ] = useState("");
  const [ordnerId, setOrdnerId] = useState<string | null>(null);
  const [suchTreffer, setSuchTreffer] = useState<KatalogTreffer[] | null>(null);
  const [ansicht, setAnsicht] = useState<OrdnerAnsicht | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinzugefuegt, setHinzugefuegt] = useState<Set<string>>(new Set());
  const [laeuft, starte] = useTransition();
  const suchen = q.trim().length > 0;

  // Suche über alle Ordner (mit kleiner Verzögerung) oder Inhalt des gewählten Ordners
  useEffect(() => {
    let aktuell = true;
    const timer = setTimeout(async () => {
      if (suchen) {
        const r = await katalogSuchen(art, q);
        if (!aktuell) return;
        if (r.fehler) return setFehler(r.fehler);
        setFehler(null);
        setSuchTreffer(r.treffer ?? []);
      } else {
        const r = await katalogOrdnerInhalt(art, ordnerId);
        if (!aktuell) return;
        if (r.fehler) return setFehler(r.fehler);
        setFehler(null);
        setAnsicht({ pfad: r.pfad ?? [], unterordner: r.unterordner ?? [], treffer: r.treffer ?? [] });
      }
    }, suchen ? 250 : 0);
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [art, q, ordnerId, suchen]);

  function hinzufuegen(t: KatalogTreffer) {
    setFehler(null);
    starte(async () => {
      const r = await positionAusKatalog(angebotId, art, t.id, nachId);
      if (r.fehler) return setFehler(r.fehler);
      setHinzugefuegt((alt) => new Set(alt).add(t.id));
      router.refresh();
    });
  }

  const treffer = suchen ? suchTreffer : ansicht?.treffer ?? null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-primary/30 bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Aus dem Katalog hinzufügen</h3>
        <Button type="button" variant="ghost" size="icon" aria-label="Schließen" onClick={onSchliessen}><XIcon /></Button>
      </div>
      <div className="flex gap-2 text-sm" role="tablist" aria-label="Art">
        {(["leistung", "material"] as const).map((a) => (
          <button key={a} type="button" role="tab" aria-selected={a === art}
            onClick={() => { setArt(a); setOrdnerId(null); setSuchTreffer(null); setAnsicht(null); }}
            className={cn("flex h-9 items-center rounded-full border px-4", a === art ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {KATALOG_ART_NAMEN[a]}
          </button>
        ))}
      </div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setSuchTreffer(null); }} aria-label="Katalog durchsuchen"
          placeholder="Suchen in allen Ordnern: Bezeichnung, Nummer …"
          className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      </div>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      {/* Ordner-Pfad und Unterordner (nur beim Blättern, nicht bei der Suche) */}
      {!suchen && ansicht && (
        <>
          <nav aria-label="Ordner-Pfad" className="flex flex-wrap items-center gap-1 text-sm">
            <button type="button" onClick={() => setOrdnerId(null)} className={cn("hover:underline", !ordnerId && "font-semibold")}>Alle Ordner</button>
            {ansicht.pfad.map((o, i) => (
              <span key={o.id} className="flex items-center gap-1">
                <ChevronRightIcon className="size-4 text-muted-foreground" />
                <button type="button" onClick={() => setOrdnerId(o.id)} className={cn("hover:underline", i === ansicht.pfad.length - 1 && "font-semibold")}>{o.name}</button>
              </span>
            ))}
          </nav>
          {ansicht.unterordner.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {ansicht.unterordner.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setOrdnerId(o.id)}
                    className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left hover:bg-muted">
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" /> <span className="truncate">{o.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {treffer === null ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : treffer.length === 0 ? (
        <p className="text-sm text-muted-foreground">{suchen ? "Nichts gefunden." : ansicht && ansicht.unterordner.length > 0 ? "In diesem Ordner liegen keine Einträge direkt, wähle einen Unterordner." : "In diesem Ordner liegt nichts."}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {treffer.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.name}</p>
                <p className="truncate text-xs text-muted-foreground">{[t.nummer, t.ordner].filter(Boolean).join(" · ") || "–"}</p>
              </div>
              <span className="shrink-0 text-right text-sm tabular-nums">
                {formatBetrag(t.vk)}<span className="block text-xs text-muted-foreground">pro {t.einheit}</span>
              </span>
              <Button type="button" size="sm" variant={hinzugefuegt.has(t.id) ? "secondary" : "default"} disabled={laeuft} onClick={() => hinzufuegen(t)}>
                {hinzugefuegt.has(t.id) ? <CheckIcon /> : <PlusIcon />} {hinzugefuegt.has(t.id) ? "Nochmal" : "Hinzufügen"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Menge und Preis kannst du danach in der Position ändern. Die Suche zeigt höchstens 25 Treffer, ein Ordner höchstens 100 Einträge.</p>
    </div>
  );
}
