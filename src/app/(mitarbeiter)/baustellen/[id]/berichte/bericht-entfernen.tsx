"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { berichtArchivieren } from "../../bericht-actions";

/** Bericht entfernen (archivieren) mit Rückfrage. */
export function BerichtEntfernen({ projektId, berichtId }: { projektId: string; berichtId: string }) {
  const router = useRouter();
  const [frage, setFrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function entfernen() {
    setFehler(null);
    starte(async () => {
      const r = await berichtArchivieren(berichtId, projektId);
      if (r.fehler) return setFehler(r.fehler);
      router.push(`/baustellen/${projektId}/berichte`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {frage ? (
        <div className="flex gap-2">
          <Button type="button" variant="destructive" size="touch" className="flex-1" disabled={laeuft} onClick={entfernen}>Wirklich entfernen</Button>
          <Button type="button" variant="ghost" size="touch" onClick={() => setFrage(false)}>Abbrechen</Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="touch" onClick={() => setFrage(true)}><Trash2Icon /> Bericht entfernen</Button>
      )}
    </div>
  );
}
