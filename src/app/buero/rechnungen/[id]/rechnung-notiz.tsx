"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rechnungNotizSpeichern } from "../actions";

/** Notiz zur Rechnung wie in Plancraft: „Notiz hinzufügen“, danach ein Textfeld; die Notiz bleibt immer änderbar. */
export function RechnungNotiz({ rechnungId, start }: { rechnungId: string; start: string }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function speichern() {
    setFehler(null);
    starte(async () => {
      const r = await rechnungNotizSpeichern(rechnungId, text);
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Notiz gespeichert.");
      setOffen(false);
      router.refresh();
    });
  }

  if (!offen) {
    return (
      <div className="flex flex-col gap-2 px-3">
        {start && <p className="text-[13px] whitespace-pre-line">{start}</p>}
        <button type="button" onClick={() => setOffen(true)} className="flex w-fit items-center gap-2 text-[13px] font-semibold hover:underline">
          <PlusCircleIcon className="size-4" /> {start ? "Notiz bearbeiten" : "Notiz hinzufügen"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3">
      <textarea
        aria-label="Notiz"
        value={text}
        onChange={(e) => { setText(e.target.value); setFehler(null); }}
        rows={4}
        maxLength={2000}
        placeholder="Interne Notiz (steht nicht auf der Rechnung)"
        className="w-full max-w-xl rounded-md border border-border bg-white px-3 py-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      {fehler && <p role="alert" className="text-[13px] text-destructive">{fehler}</p>}
      <div className="flex gap-2">
        <Button type="button" className="h-8 px-3 text-[13px]" disabled={laeuft} onClick={speichern}>{laeuft ? "Speichern …" : "Speichern"}</Button>
        <Button type="button" variant="ghost" className="h-8 px-3 text-[13px]" disabled={laeuft} onClick={() => { setOffen(false); setText(start); setFehler(null); }}>Abbrechen</Button>
      </div>
    </div>
  );
}
