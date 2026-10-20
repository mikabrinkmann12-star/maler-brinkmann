"use client";

import { useState, useTransition } from "react";
import { Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { urlaubZuruecknehmen } from "./actions";

/**
 * Genehmigten Urlaub bzw. genehmigtes Abfeiern zurücknehmen (nur Admin sichtbar), z. B. wenn jemand doch gebraucht wird.
 * Läuft der Zeitraum schon, gibt es zwei Wege: nur den Rest ab heute oder den ganzen Antrag.
 */
export function Ruecknahme({ antragId, name, laeuft, abfeiern }: { antragId: string; name: string; laeuft: boolean; abfeiern: boolean }) {
  const [offen, setOffen] = useState(false);
  const [grund, setGrund] = useState("");
  const [bearbeite, starte] = useTransition();
  const was = abfeiern ? "Abfeiern" : "Urlaub";

  function zuruecknehmen(umfang: "ganz" | "rest") {
    const frage =
      umfang === "rest"
        ? `Den Rest ab heute von ${name} zurücknehmen? Schon vergangene Tage bleiben gebucht.`
        : `Den ganzen Antrag von ${name} zurücknehmen? Alle gebuchten Tage fallen weg.`;
    if (!window.confirm(frage)) return;
    starte(async () => {
      try {
        const r = await urlaubZuruecknehmen({ id: antragId, umfang, grund });
        if (r.fehler) toast.error(r.fehler);
        else {
          toast.success(umfang === "rest" ? `${was} von ${name} ab heute zurückgenommen.` : `${was} von ${name} zurückgenommen.`);
          setOffen(false);
        }
      } catch {
        toast.error("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  if (!offen) {
    return (
      <div>
        <Button type="button" variant="outline" onClick={() => setOffen(true)}>
          <Undo2Icon /> {was} zurücknehmen
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
      <p className="text-sm">
        {laeuft
          ? `${name} ist schon mittendrin. Du kannst nur den Rest ab heute zurücknehmen (vergangene Tage bleiben gebucht) oder den ganzen Antrag.`
          : `Der Antrag von ${name} beginnt erst später. Beim Zurücknehmen fallen alle gebuchten Tage weg.`}
      </p>
      <Input aria-label="Grund (optional)" placeholder="Grund (optional), z. B. wird auf der Baustelle gebraucht" maxLength={300} value={grund} onChange={(e) => setGrund(e.target.value)} className="h-11 text-base" />
      <div className="flex flex-wrap gap-2">
        {laeuft && (
          <Button type="button" disabled={bearbeite} onClick={() => zuruecknehmen("rest")}>
            Rest ab heute zurücknehmen
          </Button>
        )}
        <Button type="button" variant={laeuft ? "outline" : "default"} disabled={bearbeite} onClick={() => zuruecknehmen("ganz")}>
          {laeuft ? "Ganzen Antrag zurücknehmen" : "Zurücknehmen"}
        </Button>
        <Button type="button" variant="ghost" disabled={bearbeite} onClick={() => setOffen(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
