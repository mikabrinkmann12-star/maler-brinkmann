"use client";

import { useState, useTransition } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { urlaubEntscheiden } from "./actions";

/** Genehmigen / Ablehnen mit optionaler Antwort (nur für den Admin sichtbar). */
export function Entscheidung({ antragId, name }: { antragId: string; name: string }) {
  const [antwort, setAntwort] = useState("");
  const [laeuft, starte] = useTransition();

  function entscheiden(entscheidung: "genehmigt" | "abgelehnt") {
    if (entscheidung === "abgelehnt" && !window.confirm(`Antrag von ${name} ablehnen?`)) return;
    starte(async () => {
      try {
        const r = await urlaubEntscheiden({ id: antragId, entscheidung, antwort });
        if (r.fehler) toast.error(r.fehler);
        else toast.success(entscheidung === "genehmigt" ? `Urlaub von ${name} genehmigt.` : `Antrag von ${name} abgelehnt.`);
      } catch {
        toast.error("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Input aria-label="Antwort (optional)" placeholder="Antwort (optional)" maxLength={500} value={antwort}
        onChange={(e) => setAntwort(e.target.value)} className="h-11 text-base" />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="touch" disabled={laeuft} onClick={() => entscheiden("genehmigt")}>
          <CheckIcon /> Genehmigen
        </Button>
        <Button type="button" size="touch" variant="outline" disabled={laeuft} onClick={() => entscheiden("abgelehnt")}>
          <XIcon /> Ablehnen
        </Button>
      </div>
    </div>
  );
}
