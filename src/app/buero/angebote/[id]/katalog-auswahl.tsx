"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { formatBetrag } from "@/lib/format";
import { KATALOG_ART_NAMEN, type KatalogArt } from "@/lib/katalog";
import { katalogSuchen, positionAusKatalog, type KatalogTreffer } from "../actions";

/** Katalog durchsuchen und Einträge als Positionen ins Angebot kopieren (Menge 1, Verkaufspreis; im Angebot änderbar). */
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
  const [treffer, setTreffer] = useState<KatalogTreffer[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinzugefuegt, setHinzugefuegt] = useState<Set<string>>(new Set());
  const [laeuft, starte] = useTransition();

  // Suche mit kleiner Verzögerung, damit nicht bei jedem Buchstaben gefragt wird
  useEffect(() => {
    let aktuell = true;
    const timer = setTimeout(async () => {
      const r = await katalogSuchen(art, q);
      if (!aktuell) return;
      if (r.fehler) setFehler(r.fehler);
      else {
        setFehler(null);
        setTreffer(r.treffer ?? []);
      }
    }, 250);
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [art, q]);

  function hinzufuegen(t: KatalogTreffer) {
    setFehler(null);
    starte(async () => {
      const r = await positionAusKatalog(angebotId, art, t.id, nachId);
      if (r.fehler) return setFehler(r.fehler);
      setHinzugefuegt((alt) => new Set(alt).add(t.id));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-primary/30 bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Aus dem Katalog hinzufügen</h3>
        <Button type="button" variant="ghost" size="icon" aria-label="Schließen" onClick={onSchliessen}><XIcon /></Button>
      </div>
      <div className="flex gap-2 text-sm" role="tablist" aria-label="Art">
        {(["leistung", "material"] as const).map((a) => (
          <button key={a} type="button" role="tab" aria-selected={a === art} onClick={() => { setArt(a); setTreffer(null); }}
            className={cn("flex h-9 items-center rounded-full border px-4", a === art ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {KATALOG_ART_NAMEN[a]}
          </button>
        ))}
      </div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Katalog durchsuchen" placeholder="Suchen: Bezeichnung, Nummer …" autoFocus
          className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      </div>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {treffer === null ? (
        <p className="text-sm text-muted-foreground">Suche läuft …</p>
      ) : treffer.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nichts gefunden.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {treffer.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[t.nummer, t.ordner].filter(Boolean).join(" · ") || "–"}
                </p>
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
      <p className="text-xs text-muted-foreground">Menge und Preis kannst du danach in der Position ändern. Es werden höchstens 25 Treffer gezeigt: Suche genauer, um andere zu finden.</p>
    </div>
  );
}
