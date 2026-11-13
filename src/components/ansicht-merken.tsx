"use client";

import { useEffect } from "react";
import { ansichtMerken, type Ansicht } from "@/lib/ansicht";

/** Merkt beim Öffnen der Büro-Ansicht, dass Projektseiten wieder im Büro-Rahmen erscheinen sollen. */
export function AnsichtMerken({ ansicht }: { ansicht: Ansicht }) {
  useEffect(() => ansichtMerken(ansicht), [ansicht]);
  return null;
}
