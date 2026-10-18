"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filter einer Liste stehen in der Adresse (?q=…&status=…): so funktionieren Zurück-Knopf, Lesezeichen und Neuladen.
 * `setzen({ status: "a,b", q: "" })` ändert nur die genannten Teile; leere Werte werden entfernt; die Seite beginnt wieder vorn.
 */
export function useUrlFilter() {
  const router = useRouter();
  const pfad = usePathname();
  const aktuell = useSearchParams();

  const setzen = useCallback(
    (teil: Record<string, string | null | undefined>) => {
      const p = new URLSearchParams(aktuell.toString());
      for (const [k, v] of Object.entries(teil)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      p.delete("seite");
      router.push(`${pfad}${p.size ? `?${p}` : ""}`);
    },
    [aktuell, pfad, router],
  );

  return { setzen, aktuell };
}
