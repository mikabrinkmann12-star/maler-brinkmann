"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { SeitenKopf } from "@/components/layout/seiten-kopf";

// Kopf einer Projektseite der Mitarbeiter-App (wie Plancraft): Zurück-Pfeil, Projektname und
// darunter Chip-Reiter. Er erscheint nur auf den Reiter-Seiten selbst, nicht auf Unterseiten
// wie „Bericht erstellen“ oder „Aufmaß hinzufügen“ (die haben einen eigenen Kopf).

type Chip = { segment: string; name: string; zaehler?: string };

export function ProjektKopf({
  projektId,
  name,
  zurueck,
  zeigeChat,
  zeigeBerichte,
  chatNeu,
}: {
  projektId: string;
  name: string;
  zurueck: string;
  zeigeChat: boolean;
  zeigeBerichte: boolean;
  chatNeu: string;
}) {
  const pfad = usePathname();
  const aktiverChip = useRef<HTMLAnchorElement>(null);
  // Der gewählte Chip soll im Streifen sichtbar sein (z. B. „Arbeitsanweisungen“ ganz rechts)
  useEffect(() => {
    const el = aktiverChip.current;
    if (!el) return;
    const leiste = el.closest("nav");
    if (leiste) leiste.scrollTo({ left: el.offsetLeft - leiste.clientWidth / 2 + el.clientWidth / 2, behavior: "auto" });
  }, [pfad]);
  const basis = `/baustellen/${projektId}`;
  if (pfad !== basis && !pfad.startsWith(`${basis}/`)) return null;
  const rest = pfad.slice(basis.length).replace(/^\//, "");

  const chips: Chip[] = [
    { segment: "", name: "Infos" },
    ...(zeigeChat ? [{ segment: "chat", name: "Chat", zaehler: chatNeu }] : []),
    ...(zeigeBerichte ? [{ segment: "berichte", name: "Berichte" }] : []),
    { segment: "ablage", name: "Ablage" },
    { segment: "anweisungen", name: "Arbeitsanweisungen" },
    { segment: "material", name: "Material" },
    { segment: "aufmass", name: "Aufmaß" },
  ];
  if (!chips.some((c) => c.segment === rest)) return null;

  return (
    <div className="-mt-1 mb-4">
      <SeitenKopf titel={name} zurueck={zurueck} />
      <nav aria-label="Bereiche des Projekts" className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <ul className="flex w-max gap-2">
          {chips.map((c) => {
            const aktiv = c.segment === rest;
            return (
              <li key={c.segment}>
                <Link
                  ref={aktiv ? aktiverChip : undefined}
                  href={c.segment ? `${basis}/${c.segment}` : basis}
                  aria-current={aktiv ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors",
                    aktiv ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                  )}
                >
                  {c.name}
                  {c.zaehler && (
                    <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs leading-5 font-semibold text-white">{c.zaehler}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
