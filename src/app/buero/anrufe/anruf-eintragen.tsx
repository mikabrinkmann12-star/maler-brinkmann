"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KATEGORIEN, KATEGORIE_NAMEN, type AnrufKategorie } from "@/lib/anruf";
import { neueId } from "@/lib/warteschlange";
import { anrufEintragen } from "./actions";

const feld = "h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Anruf von Hand eintragen (verpasster Anruf, Anruf auf dem Handy …). */
export function AnrufEintragen() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [id, setId] = useState(() => neueId());
  const [von, setVon] = useState("");
  const [text, setText] = useState("");
  const [kategorie, setKategorie] = useState<AnrufKategorie | "">("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  if (!offen) {
    return <Button type="button" size="sm" onClick={() => setOffen(true)}><PlusIcon /> Anruf eintragen</Button>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        starte(async () => {
          setFehler(null);
          try {
            const r = await anrufEintragen({ id, von, zusammenfassung: text, kategorie: kategorie || undefined });
            if (r.fehler) return void setFehler(r.fehler);
            toast.success("Anruf eingetragen.");
            setId(neueId());
            setVon("");
            setText("");
            setKategorie("");
            setOffen(false);
            router.refresh();
          } catch {
            setFehler("Keine Verbindung. Bitte nochmal versuchen.");
          }
        });
      }}
      className="flex w-full flex-col gap-3 rounded-xl border bg-white p-4"
    >
      <h2 className="font-semibold">Anruf eintragen</h2>
      <input aria-label="Rufnummer (optional)" placeholder="Rufnummer (optional)" maxLength={40} value={von} onChange={(e) => setVon(e.target.value)} className={feld} />
      <textarea aria-label="Worum ging es?" placeholder="Worum ging es?" rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      <select aria-label="Kategorie" value={kategorie} onChange={(e) => setKategorie(e.target.value as AnrufKategorie | "")} className={feld}>
        <option value="">Kategorie automatisch</option>
        {KATEGORIEN.map((k) => <option key={k} value={k}>{KATEGORIE_NAMEN[k]}</option>)}
      </select>
      {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={laeuft}>Eintragen</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOffen(false)}>Abbrechen</Button>
      </div>
    </form>
  );
}
