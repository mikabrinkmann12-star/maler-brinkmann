import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

/** Kopf einer Unterseite der Mitarbeiter-App: Zurück-Pfeil, Titel, optional eine Aktion rechts. */
export function SeitenKopf({
  titel,
  zurueck,
  aktion,
}: {
  titel: string;
  zurueck: string;
  aktion?: React.ReactNode;
}) {
  return (
    <div className="mb-4 grid grid-cols-[3rem_1fr_3rem] items-center">
      <Link
        href={zurueck}
        aria-label="Zurück"
        className="-ml-2 flex size-12 items-center justify-center rounded-full transition-colors hover:bg-muted"
      >
        <ArrowLeftIcon className="size-6" />
      </Link>
      <h1 className="truncate text-center text-lg font-semibold">{titel}</h1>
      <div className="flex justify-end">{aktion}</div>
    </div>
  );
}
