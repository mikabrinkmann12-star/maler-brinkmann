"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, LockOpenIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { containerErledigt, containerSperreAufheben } from "@/app/(mitarbeiter)/container/actions";

/** Knöpfe einer Meldung: „Erledigt“ (mit Notiz, z. B. „bestellt bei Firma X, Lieferung Donnerstag“) und „Sperre aufheben“. */
export function ContainerAktionen({ id, erledigt, gesperrt }: { id: string; erledigt: boolean; gesperrt: boolean }) {
  const router = useRouter();
  const [notiz, setNotiz] = useState("");
  const [offen, setOffen] = useState(false);
  const [laeuft, starte] = useTransition();

  function lauf(f: () => Promise<{ fehler?: string }>, ok: string) {
    starte(async () => {
      try {
        const r = await f();
        if (r.fehler) return void toast.error(r.fehler);
        toast.success(ok);
        setOffen(false);
        router.refresh();
      } catch {
        toast.error("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {!erledigt && (
          <Button type="button" size="sm" disabled={laeuft} onClick={() => setOffen((o) => !o)}>
            <CheckIcon /> Erledigt
          </Button>
        )}
        {gesperrt && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={laeuft}
            onClick={() => window.confirm("Die Sperre aufheben? Dann kann dieser Container sofort wieder gemeldet werden.") && lauf(() => containerSperreAufheben(id), "Sperre aufgehoben.")}
          >
            <LockOpenIcon /> Sperre aufheben
          </Button>
        )}
      </div>
      {offen && (
        <div className="flex w-full max-w-md flex-col gap-2">
          <Input aria-label="Notiz (optional)" placeholder="Notiz (optional), z. B. bestellt, Lieferung Donnerstag" maxLength={300} value={notiz} onChange={(e) => setNotiz(e.target.value)} className="h-10" />
          <Button type="button" size="sm" disabled={laeuft} onClick={() => lauf(() => containerErledigt({ id, notiz }), "Als erledigt markiert.")}>
            Als erledigt speichern
          </Button>
        </div>
      )}
    </div>
  );
}
