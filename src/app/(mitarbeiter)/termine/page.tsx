import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClockIcon, ChevronRightIcon, MapPinIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireRecht } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatTagKurz } from "@/lib/format";
import { termineLaden } from "@/lib/termine-daten";
import { Warteschlange } from "../warteschlange";

export const metadata: Metadata = { title: "Termine" };

export default async function TermineSeite() {
  const nutzer = await requireRecht("termine");
  // Auch Büro/Admin sehen hier (Mitarbeiter-Ansicht) nur ihre eigenen Termine
  const termine = await termineLaden({ ab: heuteIso(), nurPerson: nutzer.id });
  const tage = [...new Set(termine.map((t) => t.datum))];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Meine Termine</h1>
      <Warteschlange userId={nutzer.id} />
      <Link href="/termine/neu" className={buttonVariants({ size: "touch", className: "w-full" })}>
        <PlusIcon /> Termin eintragen
      </Link>
      <p className="text-sm text-muted-foreground">
        Z. B. wenn Ralf sagt „Dienstag musst du zu von Garrel“: Trag es hier ein, dann steht es bei der Einteilung schon da.
      </p>

      {tage.length === 0 && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">Keine anstehenden Termine.</p>}
      {tage.map((tag) => (
        <section key={tag} className="flex flex-col gap-2">
          <h2 className="px-1 font-semibold">{formatTagKurz(tag)}</h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {termine.filter((t) => t.datum === tag).map((t) => (
              <li key={t.id}>
                <Link href={`/termine/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                  <CalendarClockIcon className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t.zeit && `${t.zeit} Uhr · `}{t.titel}</span>
                    {(t.ort || t.projektName) && (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPinIcon className="size-3.5" /> {[t.projektName, t.ort].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
