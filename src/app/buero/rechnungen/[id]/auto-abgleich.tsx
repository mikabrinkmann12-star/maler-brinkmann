"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { rechnungAbgleichen } from "../actions";

/**
 * Gleicht die Rechnung beim Öffnen einmal automatisch mit der Buchhaltung ab (Status, Zahlung, Nummer und Datei) und lädt die Seite danach neu.
 * Die Seite rendert diese Komponente nur, wenn der Abgleich fällig ist (`abgleichFaellig`), damit keine Schleife entsteht.
 */
export function AutoAbgleich({ rechnungId, name }: { rechnungId: string; name: string }) {
  const router = useRouter();
  const gestartet = useRef(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    if (gestartet.current) return;
    gestartet.current = true;
    rechnungAbgleichen(rechnungId)
      .then((r) => {
        if (r.fehler) setFehler(r.fehler);
        else router.refresh();
      })
      .catch(() => setFehler(`Der Abgleich mit ${name} hat nicht geklappt.`));
  }, [rechnungId, name, router]);

  if (fehler) return <p className="text-xs text-destructive">{fehler} Mit „Abgleichen“ kannst du es nochmal versuchen.</p>;
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <RefreshCwIcon className="size-3.5 animate-spin" /> Wird mit {name} abgeglichen …
    </p>
  );
}
