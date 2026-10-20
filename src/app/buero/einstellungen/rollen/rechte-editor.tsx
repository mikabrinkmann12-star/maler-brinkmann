"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LockIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { FormularMeldung } from "@/components/formular-meldung";
import { FESTE_RECHTE, RECHT_GRUPPEN, standardRechte, stufeText, type Rechte, type Stufe } from "@/lib/rechte";
import { rechteSpeichern } from "./actions";

type Rolle2 = "mitarbeiter" | "buero";
type Werte = Record<Rolle2, Rechte>;

const SPALTEN: { rolle: Rolle2; name: string }[] = [
  { rolle: "mitarbeiter", name: "Mitarbeiter" },
  { rolle: "buero", name: "Büro" },
];

/** Rechte-Tabelle: je Funktion eine Auswahl für Mitarbeiter und Büro, der Admin darf immer alles. Gespeichert wird erst nach der Bestätigung. */
export function RechteEditor({ gespeichert }: { gespeichert: Werte }) {
  const router = useRouter();
  const [werte, setWerte] = useState<Werte>(gespeichert);
  const [bestaetigen, setBestaetigen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  const aenderungen = useMemo(() => {
    const liste: { rolle: Rolle2; recht: string; name: string; alt: Stufe; neu: Stufe }[] = [];
    for (const g of RECHT_GRUPPEN) {
      for (const r of g.rechte) {
        for (const { rolle } of SPALTEN) {
          const alt = gespeichert[rolle][r.schluessel];
          const neu = werte[rolle][r.schluessel];
          if (alt !== neu) liste.push({ rolle, recht: r.schluessel, name: r.name, alt, neu });
        }
      }
    }
    return liste;
  }, [werte, gespeichert]);

  function setzen(rolle: Rolle2, recht: string, stufe: Stufe) {
    setErfolg(null);
    setFehler(null);
    setBestaetigen(false);
    setWerte((w) => ({ ...w, [rolle]: { ...w[rolle], [recht]: stufe } }));
  }

  function standardLaden() {
    setErfolg(null);
    setFehler(null);
    setBestaetigen(false);
    setWerte({ mitarbeiter: standardRechte("mitarbeiter"), buero: standardRechte("buero") });
  }

  function verwerfen() {
    setWerte(gespeichert);
    setBestaetigen(false);
    setFehler(null);
  }

  function speichern() {
    setFehler(null);
    starten(async () => {
      const r = await rechteSpeichern(aenderungen.map((a) => ({ rolle: a.rolle, recht: a.recht, stufe: a.neu })));
      if (r.fehler) return setFehler(r.fehler);
      setBestaetigen(false);
      setErfolg(`${r.geaendert} ${r.geaendert === 1 ? "Änderung gespeichert" : "Änderungen gespeichert"}. Sie gelten ab der nächsten Seite, die geladen wird.`);
      router.refresh();
    });
  }

  const rolleName = (r: Rolle2) => (r === "buero" ? "Büro" : "Mitarbeiter");

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-xs font-semibold">
              <th className="px-3 py-2.5 text-left">Funktion</th>
              {SPALTEN.map((s) => <th key={s.rolle} className="w-44 px-3 py-2.5 text-center">{s.name}</th>)}
              <th className="w-24 px-3 py-2.5 text-center">Admin</th>
            </tr>
          </thead>
          {RECHT_GRUPPEN.map((g) => (
            <tbody key={g.titel}>
              <tr className="bg-muted/40"><th colSpan={4} className="px-3 py-1.5 text-left text-xs font-semibold">{g.titel}</th></tr>
              {g.rechte.map((r) => (
                <tr key={r.schluessel} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <span>{r.name}</span>
                    {r.verleih && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">Admin-Recht, kann verliehen werden</span>}
                    {r.hinweis && <p className="mt-0.5 text-xs text-muted-foreground">{r.hinweis}</p>}
                  </td>
                  {SPALTEN.map(({ rolle }) => {
                    const optionen = rolle === "buero" ? r.buero : r.mitarbeiter;
                    const wert = werte[rolle][r.schluessel];
                    const geaendert = wert !== gespeichert[rolle][r.schluessel];
                    return (
                      <td key={rolle} className={cn("px-3 py-2 text-center", geaendert && "bg-amber-50")}>
                        {optionen ? (
                          <select
                            value={wert}
                            onChange={(e) => setzen(rolle, r.schluessel, e.target.value as Stufe)}
                            aria-label={`${r.name}: ${rolleName(rolle)}`}
                            className={cn(
                              "h-8 w-full min-w-32 rounded-md border bg-white px-2 text-[13px]",
                              wert === "nein" ? "text-muted-foreground" : "font-medium text-green-800",
                            )}
                          >
                            {optionen.map((s) => <option key={s} value={s}>{stufeText(s, rolle)}</option>)}
                          </select>
                        ) : (
                          <span className="text-muted-foreground/50" title="Diese Funktion gibt es in der Mitarbeiter-App nicht">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><LockIcon className="size-3" /> Ja</span>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
          <tbody>
            <tr className="bg-muted/40"><th colSpan={4} className="px-3 py-1.5 text-left text-xs font-semibold">Nur Admin (fest, nicht einstellbar)</th></tr>
            {FESTE_RECHTE.map((f) => (
              <tr key={f.name} className="border-b last:border-b-0">
                <td className="px-3 py-2">
                  <span>{f.name}</span>
                  {f.hinweis && <p className="mt-0.5 text-xs text-muted-foreground">{f.hinweis}</p>}
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground/50">–</td>
                <td className="px-3 py-2 text-center text-muted-foreground/50">–</td>
                <td className="px-3 py-2 text-center"><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><LockIcon className="size-3" /> Ja</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {erfolg && <p role="status" className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-[13px] text-green-900">{erfolg}</p>}
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      {/* Leiste unten: bleibt beim Scrollen sichtbar, sobald etwas geändert ist */}
      <div className={cn("sticky bottom-3 z-10 flex flex-col gap-3 rounded-lg border bg-white p-3 shadow-md", aenderungen.length === 0 && "shadow-none")}>
        {bestaetigen && aenderungen.length > 0 && (
          <div className="flex flex-col gap-1.5 text-[13px]">
            <p className="font-semibold">Diese {aenderungen.length === 1 ? "Änderung gilt" : `${aenderungen.length} Änderungen gelten`} sofort für alle Personen der Rolle:</p>
            <ul className="max-h-48 overflow-y-auto rounded-md bg-muted/40 p-2">
              {aenderungen.map((a) => (
                <li key={`${a.rolle}-${a.recht}`} className="py-0.5">
                  <span className="font-medium">{rolleName(a.rolle)}:</span> {a.name}: {stufeText(a.alt, a.rolle)} → <span className="font-semibold">{stufeText(a.neu, a.rolle)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Wer gerade eingeloggt ist, merkt die Änderung beim nächsten Laden einer Seite. Als Admin behältst du immer alle Rechte.</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">
            {aenderungen.length === 0 ? "Keine Änderungen." : `${aenderungen.length} ${aenderungen.length === 1 ? "Änderung" : "Änderungen"} noch nicht gespeichert.`}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={standardLaden} disabled={laeuft}>
              <RotateCcwIcon /> Standard laden
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={verwerfen} disabled={laeuft || aenderungen.length === 0}>Verwerfen</Button>
            {bestaetigen ? (
              <Button type="button" size="sm" onClick={speichern} disabled={laeuft || aenderungen.length === 0}>{laeuft ? "Speichert …" : "Ja, jetzt speichern"}</Button>
            ) : (
              <Button type="button" size="sm" onClick={() => setBestaetigen(true)} disabled={aenderungen.length === 0}>Änderungen speichern</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
