"use client";

import { useState } from "react";
import { StickyNoteIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { neueId } from "@/lib/warteschlange";
import { auftragSenden } from "../../senden";

export type NotizAnzeige = { id: string; text: string; wer: string; wann: string; darfLoeschen: boolean };

/** Notizen zur Baustelle: neueste zuerst, eigene (oder als Büro alle) löschbar. */
export function Notizen({
  projektId,
  ichId,
  darfSchreiben,
  notizen,
}: {
  projektId: string;
  ichId: string;
  darfSchreiben: boolean;
  notizen: NotizAnzeige[];
}) {
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  async function speichern(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    const sauber = text.trim();
    if (!sauber || sendet) return;
    setSendet(true);
    setFehler(null);
    const notizId = neueId();
    const r = await auftragSenden(
      ichId,
      { schluessel: notizId, typ: "notiz_anlegen", titel: `Notiz: ${sauber.slice(0, 40)}${sauber.length > 40 ? " …" : ""}`, nutzlast: { daten: { id: notizId, projektId, text: sauber } } },
      { abgelehntBehalten: false },
    );
    setSendet(false);
    if (r.status === "abgelehnt") return setFehler(r.fehler);
    setText("");
    if (r.status === "wartet") toast.warning("Keine Verbindung. Die Notiz liegt sicher auf dem Handy und wird automatisch gesendet.");
    else toast.success("Notiz gespeichert.");
  }

  async function loeschen(n: NotizAnzeige) {
    if (!window.confirm("Diese Notiz löschen?")) return;
    const r = await auftragSenden(
      ichId,
      { schluessel: `notiz-weg:${n.id}`, typ: "notiz_archivieren", titel: `Notiz löschen: ${n.text.slice(0, 30)}`, nutzlast: { id: n.id } },
      { abgelehntBehalten: false },
    );
    if (r.status === "abgelehnt") toast.error(r.fehler);
    else if (r.status === "wartet") toast.warning("Keine Verbindung. Das Löschen wird automatisch nachgeholt.");
    else toast.success("Notiz gelöscht.");
  }

  return (
    <section id="notizen" className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <StickyNoteIcon className="size-5" /> Notizen ({notizen.length})
      </h2>

      {darfSchreiben && (
        <form onSubmit={speichern} className="flex flex-col gap-2">
          <label htmlFor="neue-notiz" className="sr-only">Neue Notiz</label>
          <textarea id="neue-notiz" rows={3} maxLength={2000} value={text} placeholder="z. B. Kunde wünscht zweiten Anstrich im Flur"
            onChange={(e) => { setText(e.target.value); setFehler(null); }}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
          {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
          <Button type="submit" size="touch" variant="outline" disabled={!text.trim() || sendet}>
            {sendet ? "Speichern …" : "Notiz speichern"}
          </Button>
        </form>
      )}

      {notizen.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Notizen.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notizen.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line break-words">{n.text}</p>
                <p className="mt-1 text-sm text-muted-foreground">{n.wer} · {n.wann}</p>
              </div>
              {n.darfLoeschen && (
                <Button type="button" variant="ghost" size="icon-touch" aria-label="Notiz löschen" onClick={() => loeschen(n)}>
                  <Trash2Icon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
