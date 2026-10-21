"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, FileTextIcon, ReceiptTextIcon, SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { formatBetrag, formatDatum, formatZahl } from "@/lib/format";
import { dokumentPositionen, dokumentSuchen, positionenUebernehmen, type DokumentPosition, type DokumentTreffer } from "../editor-actions";

/**
 * Positionen aus anderen Angeboten und Rechnungen übernehmen (wie „Aus bestehendem Dokument“ bzw. die Suche im Editor von Plancraft):
 * Dokument suchen, Positionen ankreuzen (oder „Alle auswählen“), „Mengen übernehmen“ ein- oder ausschalten, Übernehmen.
 */
export function DokumentAuswahl({ angebotId, nachId, onSchliessen }: { angebotId: string; nachId: string | null; onSchliessen: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [treffer, setTreffer] = useState<DokumentTreffer[] | null>(null);
  const [gewaehlt, setGewaehlt] = useState<DokumentTreffer | null>(null);
  const [positionen, setPositionen] = useState<DokumentPosition[] | null>(null);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [mengen, setMengen] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  // Suche mit kleiner Verzögerung; leer = die neuesten Dokumente
  useEffect(() => {
    let aktuell = true;
    const timer = setTimeout(async () => {
      const r = await dokumentSuchen(angebotId, q);
      if (!aktuell) return;
      if (r.fehler) return setFehler(r.fehler);
      setFehler(null);
      setTreffer(r.treffer ?? []);
    }, q.trim() ? 250 : 0);
    return () => {
      aktuell = false;
      clearTimeout(timer);
    };
  }, [angebotId, q]);

  function waehlen(t: DokumentTreffer) {
    setFehler(null);
    setGewaehlt(t);
    setPositionen(null);
    setIds(new Set());
    starte(async () => {
      const r = await dokumentPositionen(t.art, t.id);
      if (r.fehler) return setFehler(r.fehler);
      setPositionen(r.positionen ?? []);
    });
  }

  function umschalten(id: string) {
    setIds((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(id)) neu.add(id);
      return neu;
    });
  }

  function uebernehmen() {
    if (!gewaehlt) return;
    setFehler(null);
    starte(async () => {
      const r = await positionenUebernehmen(angebotId, { art: gewaehlt.art, quelleId: gewaehlt.id, ids: [...ids], mengen, nachId });
      if (r.fehler) return setFehler(r.fehler);
      toast.success(r.hinweis ?? "Übernommen");
      router.refresh();
      onSchliessen();
    });
  }

  const alleGewaehlt = positionen !== null && positionen.length > 0 && ids.size === positionen.length;

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-primary/30 bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          {gewaehlt && (
            <Button type="button" variant="ghost" size="icon" aria-label="Zurück zur Suche" onClick={() => { setGewaehlt(null); setPositionen(null); }}><ArrowLeftIcon /></Button>
          )}
          Aus bestehendem Dokument
        </h3>
        <Button type="button" variant="ghost" size="icon" aria-label="Schließen" onClick={onSchliessen}><XIcon /></Button>
      </div>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      {!gewaehlt ? (
        <>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setTreffer(null); }} aria-label="Dokumente durchsuchen" placeholder="Angebote und Rechnungen durchsuchen: Titel, Nummer, Projekt, Kunde …"
              className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
          </div>
          {treffer === null ? (
            <p className="text-sm text-muted-foreground">Lädt …</p>
          ) : treffer.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nichts gefunden.</p>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border">
              {treffer.map((t) => (
                <li key={`${t.art}:${t.id}`}>
                  <button type="button" onClick={() => waehlen(t)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted">
                    {t.art === "angebot" ? <FileTextIcon className="size-4 shrink-0 text-muted-foreground" /> : <ReceiptTextIcon className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{t.titel}{t.nummer && <span className="font-normal text-muted-foreground"> · {t.nummer}</span>}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t.art === "angebot" ? "Angebot" : "Rechnung"} · {[t.kunde, t.projekt].filter(Boolean).join(" · ") || "–"}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t.datum ? formatDatum(t.datum) : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="text-sm"><span className="font-medium">{gewaehlt.titel}</span> <span className="text-muted-foreground">({gewaehlt.art === "angebot" ? "Angebot" : "Rechnung"})</span></p>
          {positionen === null ? (
            <p className="text-sm text-muted-foreground">Lädt …</p>
          ) : positionen.length === 0 ? (
            <p className="text-sm text-muted-foreground">Dieses Dokument hat keine Positionen.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={alleGewaehlt} onChange={() => setIds(alleGewaehlt ? new Set() : new Set(positionen.map((p) => p.id)))} className="size-4" /> Alle auswählen
              </label>
              <ul className="max-h-96 divide-y overflow-y-auto rounded-lg border">
                {positionen.map((p) => (
                  <li key={p.id}>
                    <label className={cn("flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted", p.typ === "titel" && "bg-muted/40 font-semibold")}>
                      <input type="checkbox" checked={ids.has(p.id)} onChange={() => umschalten(p.id)} className="mt-1 size-4" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{p.typ === "text" ? "Text: " : ""}{p.kurztext || "(ohne Titel)"}</span>
                        {p.langtext && <span className="line-clamp-2 text-xs text-muted-foreground">{p.langtext}</span>}
                      </span>
                      {p.typ === "position" && (
                        <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {p.menge !== null && <>{formatZahl(p.menge, { max: 3 })} {p.einheit}<br /></>}
                          {p.einzelpreis !== null && formatBetrag(p.einzelpreis)}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={mengen} onChange={(e) => setMengen(e.target.checked)} className="size-4" /> Mengen übernehmen
              </label>
              <div className="flex items-center gap-3">
                <Button type="button" onClick={uebernehmen} disabled={laeuft || ids.size === 0}>{laeuft ? "Übernimmt …" : `${ids.size} übernehmen`}</Button>
                <span className="text-xs text-muted-foreground">Preise und Texte kannst du danach ändern.</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
