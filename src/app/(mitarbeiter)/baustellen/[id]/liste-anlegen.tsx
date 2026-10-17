"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { projektListeAnlegen } from "@/app/buero/angebote/anweisung-actions";

/** Büro: eine leere Arbeitsanweisung oder Materialliste direkt am Projekt anlegen (ohne Angebot) und von Hand schreiben. */
export function ListeAnlegen({ projektId, art }: { projektId: string; art: "arbeitsanweisung" | "materialliste" }) {
  const router = useRouter();
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function anlegen() {
    setFehler(null);
    starte(async () => {
      const r = await projektListeAnlegen(projektId, art);
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Angelegt: bitte Text eintragen und freigeben");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={anlegen} disabled={laeuft}>
          <PlusIcon /> {art === "materialliste" ? "Leere Materialliste anlegen" : "Leere Arbeitsanweisung anlegen"}
        </Button>
      </div>
    </div>
  );
}
