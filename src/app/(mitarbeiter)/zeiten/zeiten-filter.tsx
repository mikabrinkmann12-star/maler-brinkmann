"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";

type Option = { wert: string; name: string };

/** Auswahl im Pillen-Stil (grün, mit Pfeil). Ein natives Auswahlfeld, das die Adresse ändert. */
function Pille({ name, wert, optionen, aendern }: { name: string; wert: string; optionen: Option[]; aendern: (v: string) => void }) {
  const aktuell = optionen.find((o) => o.wert === wert)?.name ?? optionen[0]?.name ?? "";
  return (
    <span className="relative inline-flex h-10 shrink-0 items-center gap-1 rounded-full bg-primary/15 pr-3 pl-4 text-sm font-medium text-primary">
      <span className="max-w-40 truncate">{aktuell}</span>
      <ChevronDownIcon className="size-4" />
      <select
        aria-label={name}
        value={wert}
        onChange={(e) => aendern(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert}>{o.name}</option>
        ))}
      </select>
    </span>
  );
}

/** Filter-Pillen der Zeitenliste: Zeitraum (Woche/Monat) und Projekt. Die Auswahl steht in der Adresse. */
export function ZeitenFilter({ bereich, projekt, projekte }: { bereich: "woche" | "monat"; projekt: string; projekte: Option[] }) {
  const router = useRouter();
  const pfad = usePathname();
  const parameter = useSearchParams();

  function setzen(schluessel: string, wert: string) {
    const neu = new URLSearchParams(parameter.toString());
    if (wert) neu.set(schluessel, wert);
    else neu.delete(schluessel);
    if (schluessel === "bereich") neu.delete("datum"); // beim Wechsel wieder zu heute
    const text = neu.toString();
    router.replace(text ? `${pfad}?${text}` : pfad);
  }

  return (
    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
      <Pille
        name="Zeitraum"
        wert={bereich}
        optionen={[
          { wert: "woche", name: "Woche" },
          { wert: "monat", name: "Monat" },
        ]}
        aendern={(v) => setzen("bereich", v === "woche" ? "" : v)}
      />
      <Pille
        name="Projekt"
        wert={projekt}
        optionen={[{ wert: "", name: "Alle Projekte" }, ...projekte]}
        aendern={(v) => setzen("projekt", v)}
      />
    </div>
  );
}
