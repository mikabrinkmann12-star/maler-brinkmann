"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CloudOffIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  WARTESCHLANGE_EREIGNIS,
  auftraegeRoh,
  auftragEntfernen,
  listeLesen,
} from "@/lib/warteschlange";
import { auftragSenden } from "./senden";

const NEUER_VERSUCH_MS = 60_000;
let sendetGerade = false; // nie zwei Durchläufe gleichzeitig (auch nicht aus zwei Komponenten)

function abonnieren(neuLaden: () => void) {
  window.addEventListener(WARTESCHLANGE_EREIGNIS, neuLaden);
  window.addEventListener("storage", neuLaden); // Änderungen aus anderen Tabs
  return () => {
    window.removeEventListener(WARTESCHLANGE_EREIGNIS, neuLaden);
    window.removeEventListener("storage", neuLaden);
  };
}

/**
 * Zeigt Eingaben, die noch nicht beim Server angekommen sind, und schickt sie
 * automatisch erneut: beim Öffnen, sobald wieder Netz da ist, und jede Minute.
 */
export function Warteschlange({ userId }: { userId: string }) {
  const router = useRouter();
  const roh = useSyncExternalStore(abonnieren, () => auftraegeRoh(userId), () => null);
  const auftraege = useMemo(() => listeLesen(roh), [roh]);
  const [sendet, setSendet] = useState(false);

  const alleSenden = useCallback(
    async (auchAbgelehnte: boolean) => {
      if (sendetGerade) return;
      const offen = listeLesen(auftraegeRoh(userId)).filter((a) => auchAbgelehnte || !a.fehler);
      if (!offen.length) return;
      sendetGerade = true;
      setSendet(true);
      let gespeichert = 0;
      try {
        for (const a of offen) {
          const r = await auftragSenden(userId, a, { abgelehntBehalten: true });
          if (r.status === "wartet") break; // weiter kein Netz – später nochmal
          if (r.status === "gespeichert") gespeichert++;
        }
      } finally {
        sendetGerade = false;
        setSendet(false);
      }
      if (gespeichert) {
        toast.success(gespeichert === 1 ? "Ein Eintrag wurde nachträglich gespeichert." : `${gespeichert} Einträge wurden nachträglich gespeichert.`);
        router.refresh();
      }
    },
    [router, userId],
  );

  useEffect(() => {
    const versuchen = () => void alleSenden(false);
    versuchen();
    window.addEventListener("online", versuchen);
    const takt = window.setInterval(versuchen, NEUER_VERSUCH_MS);
    return () => {
      window.removeEventListener("online", versuchen);
      window.clearInterval(takt);
    };
  }, [alleSenden]);

  if (!auftraege.length) return null;

  function verwerfen(schluessel: string, titel: string) {
    if (!window.confirm(`„${titel}“ verwerfen? Der Eintrag wird dann nicht gespeichert.`)) return;
    auftragEntfernen(userId, schluessel);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950" aria-live="polite">
      <p className="flex items-center gap-2 font-medium">
        <CloudOffIcon className="size-5 shrink-0" />
        {auftraege.length === 1 ? "1 Eintrag noch nicht gespeichert" : `${auftraege.length} Einträge noch nicht gespeichert`}
      </p>
      <ul className="flex flex-col gap-2">
        {auftraege.map((a) => (
          <li key={a.schluessel} className="flex items-start justify-between gap-3 rounded-lg bg-white/70 p-3">
            <span className="min-w-0">
              <span className="block">{a.titel}</span>
              <span className={a.fehler ? "block text-sm text-destructive" : "block text-sm text-amber-800"}>
                {a.fehler ?? "Liegt sicher auf dem Handy und wird gesendet, sobald Netz da ist."}
              </span>
            </span>
            <Button type="button" variant="outline" size="icon-touch" aria-label={`${a.titel} verwerfen`}
              onClick={() => verwerfen(a.schluessel, a.titel)}>
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="touch" className="w-full bg-white" disabled={sendet}
        onClick={() => void alleSenden(true)}>
        <RefreshCwIcon className={sendet ? "animate-spin" : undefined} />
        {sendet ? "Wird gesendet …" : "Jetzt senden"}
      </Button>
    </section>
  );
}
