"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { SeitenKopf } from "@/components/layout/seiten-kopf";

// Kopf einer Projektseite der Mitarbeiter-App: Zurück-Pfeil, Projektname und darunter ein Auswahlfeld für den Bereich
// (Infos, Chat, Berichte …; Mika, 13.11.2026: statt der seitlich wischbaren Reiter). Er erscheint nur auf den Bereichs-Seiten
// selbst, nicht auf Unterseiten wie „Bericht erstellen“ oder „Aufmaß hinzufügen“ (die haben einen eigenen Kopf).

type Bereich = { segment: string; name: string; zaehler?: string };

export function ProjektKopf({
  projektId,
  name,
  zurueck,
  zeigeChat,
  zeigeBerichte,
  zeigeAnweisungen = true,
  zeigeMaterial = true,
  chatNeu,
}: {
  projektId: string;
  name: string;
  zurueck: string;
  zeigeChat: boolean;
  zeigeBerichte: boolean;
  /** Arbeitsanweisungen und Materialliste lesen (Recht „anweisungen_ansehen“) */
  zeigeAnweisungen?: boolean;
  /** Material melden und Aufmaß (Recht „baustelle_eintragen“) */
  zeigeMaterial?: boolean;
  chatNeu: string;
}) {
  const pfad = usePathname();
  const router = useRouter();
  const basis = `/baustellen/${projektId}`;
  if (pfad !== basis && !pfad.startsWith(`${basis}/`)) return null;
  const rest = pfad.slice(basis.length).replace(/^\//, "");

  const bereiche: Bereich[] = [
    { segment: "", name: "Infos" },
    ...(zeigeChat ? [{ segment: "chat", name: "Chat", zaehler: chatNeu }] : []),
    ...(zeigeBerichte ? [{ segment: "berichte", name: "Berichte" }] : []),
    { segment: "ablage", name: "Ablage" },
    ...(zeigeAnweisungen ? [{ segment: "anweisungen", name: "Arbeitsanweisungen" }] : []),
    ...(zeigeMaterial ? [{ segment: "material", name: "Material" }, { segment: "aufmass", name: "Aufmaß" }] : []),
  ];
  if (!bereiche.some((b) => b.segment === rest)) return null;

  return (
    <div className="-mt-1 mb-4">
      <SeitenKopf titel={name} zurueck={zurueck} />
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Bereich des Projekts</span>
          <select
            value={rest}
            onChange={(e) => router.push(e.target.value ? `${basis}/${e.target.value}` : basis)}
            className="h-12 w-full appearance-none rounded-lg border border-input bg-card pr-10 pl-3 text-base font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {bereiche.map((b) => (
              <option key={b.segment} value={b.segment}>
                {b.zaehler ? `${b.name} (${b.zaehler} neu)` : b.name}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground" />
        </label>
        {chatNeu && rest !== "chat" && (
          <button
            type="button"
            onClick={() => router.push(`${basis}/chat`)}
            className="flex h-12 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium"
          >
            Chat
            <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs leading-5 font-semibold text-white">{chatNeu}</span>
          </button>
        )}
      </div>
    </div>
  );
}
