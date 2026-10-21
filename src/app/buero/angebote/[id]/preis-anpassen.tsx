"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBetrag } from "@/lib/format";
import { preisAnpassenSpeichern } from "../editor-actions";

/**
 * „Preis anpassen“ wie in Plancraft: Nettosumme (vor Rabatt) direkt auf einen Wert setzen oder mit einem Zuschlag/Abschlag in Prozent
 * verändern. Alle Positionspreise werden mit demselben Faktor umgerechnet („auf alle Positionen umverteilen“).
 */
export function PreisAnpassen({ angebotId, netto }: { angebotId: string; netto: number }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [modus, setModus] = useState<"netto" | "zuschlag">("netto");
  const [wert, setWert] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function anwenden() {
    setFehler(null);
    starte(async () => {
      const r = await preisAnpassenSpeichern(angebotId, { modus, wert });
      if (r.fehler) return setFehler(r.fehler);
      toast.success(r.hinweis ?? "Preise angepasst.");
      setOffen(false);
      setWert("");
      router.refresh();
    });
  }

  if (!offen) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOffen(true)}><SlidersHorizontalIcon /> Preis anpassen</Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="font-medium">Preis anpassen</p>
      <p className="text-xs text-muted-foreground">Jetzt: Nettosumme {formatBetrag(netto)} (vor Rabatt). Alle Positionspreise werden mit demselben Faktor umgerechnet.</p>
      <div className="flex gap-3 text-xs" role="radiogroup" aria-label="Art der Anpassung">
        <label className="flex items-center gap-1.5"><input type="radio" checked={modus === "netto"} onChange={() => setModus("netto")} /> Neue Nettosumme (€)</label>
        <label className="flex items-center gap-1.5"><input type="radio" checked={modus === "zuschlag"} onChange={() => setModus("zuschlag")} /> Zuschlag/Abschlag (%)</label>
      </div>
      <Input value={wert} onChange={(e) => setWert(e.target.value)} inputMode="decimal" aria-label={modus === "netto" ? "Neue Nettosumme in Euro" : "Zuschlag in Prozent"} placeholder={modus === "netto" ? "z. B. 12.500,00" : "z. B. 5 oder -3,5"} className="h-9" />
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={anwenden} disabled={laeuft || !wert.trim()}>{laeuft ? "Rechnet …" : "Anwenden"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOffen(false)} disabled={laeuft}>Abbrechen</Button>
      </div>
    </div>
  );
}
