"use client";

import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NEUE_ZEIT_OEFFNEN, type NeueZeitVorgabe } from "@/components/layout/buero-kontext";

/** „Neue Zeit“ (grün, oben rechts auf der Zeiten-Seite): öffnet das Fenster, bei genau einer gewählten Person mit ihr vorbelegt. */
export function NeueZeitKnopf({ person }: { person?: string }) {
  return (
    <Button
      type="button"
      className="h-8 px-3 text-[13px]"
      onClick={() => window.dispatchEvent(new CustomEvent<NeueZeitVorgabe>(NEUE_ZEIT_OEFFNEN, { detail: { person } }))}
    >
      <PlusIcon className="size-3.5 sm:hidden" /> Neue Zeit
    </Button>
  );
}
