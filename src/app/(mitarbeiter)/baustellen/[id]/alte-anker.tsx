"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Ältere Links (z. B. aus dem Büro) zeigen auf „/baustellen/<id>#ablage“. Die Bereiche sind jetzt eigene
// Reiter; diese kleine Weiche schickt solche Links zum richtigen Reiter.
const ZIEL: Record<string, string> = {
  "#ablage": "ablage",
  "#notizen": "ablage",
  "#material": "material",
  "#arbeitsanweisung": "anweisungen",
  "#materialliste": "anweisungen",
};

export function AlteAnker({ projektId }: { projektId: string }) {
  const router = useRouter();
  useEffect(() => {
    const ziel = ZIEL[window.location.hash];
    if (ziel) router.replace(`/baustellen/${projektId}/${ziel}`);
  }, [projektId, router]);
  return null;
}
