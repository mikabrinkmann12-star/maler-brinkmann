"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { auftragSenden } from "../senden";

export function Zurueckziehen({ ichId, antragId, titel }: { ichId: string; antragId: string; titel: string }) {
  const [sendet, setSendet] = useState(false);

  async function zurueckziehen() {
    if (!window.confirm(`Antrag „${titel}“ zurückziehen?`)) return;
    setSendet(true);
    const r = await auftragSenden(
      ichId,
      { schluessel: `urlaub-zurueck:${antragId}`, typ: "urlaub_zurueckziehen", titel: `Zurückziehen: ${titel}`, nutzlast: { id: antragId } },
      { abgelehntBehalten: false },
    );
    setSendet(false);
    if (r.status === "abgelehnt") toast.error(r.fehler);
    else if (r.status === "wartet") toast.warning("Keine Verbindung. Das Zurückziehen wird automatisch nachgeholt.");
    else toast.success("Antrag zurückgezogen.");
  }

  return (
    <Button type="button" variant="outline" size="touch" className="w-full" disabled={sendet} onClick={zurueckziehen}>
      Antrag zurückziehen
    </Button>
  );
}
