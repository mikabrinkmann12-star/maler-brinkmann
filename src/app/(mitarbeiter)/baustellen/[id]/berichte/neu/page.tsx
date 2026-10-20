import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, FileTextIcon } from "lucide-react";
import { SeitenKopf } from "@/components/layout/seiten-kopf";
import { BERICHT_ARTEN, BERICHT_ART_NAMEN, istBerichtArt, leereDaten } from "@/lib/bericht";
import { berichtAngaben, berichtKontext, projektFotos } from "@/lib/bericht-daten";
import { heuteIso } from "@/lib/datum";
import { BerichtAssistent } from "../bericht-assistent";

export const metadata: Metadata = { title: "Bericht erstellen" };

// „Bericht erstellen“: erst die Art wählen, dann führt der Assistent durch die Abschnitte.
export default async function NeuerBerichtSeite({ params, searchParams }: PageProps<"/baustellen/[id]/berichte/neu">) {
  const { id } = await params;
  const { art } = await searchParams;
  const k = await berichtKontext(id);
  if (!k.darfSchreiben) notFound();

  if (!istBerichtArt(art)) {
    return (
      <div className="flex flex-col gap-4">
        <SeitenKopf titel="Bericht erstellen" zurueck={`/baustellen/${id}/berichte`} />
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
          {BERICHT_ARTEN.map((a) => (
            <li key={a}>
              <Link href={`/baustellen/${id}/berichte/neu?art=${a}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 text-base font-medium">{BERICHT_ART_NAMEN[a]}</span>
                <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const [fotos, { info, personen }] = await Promise.all([projektFotos(k), berichtAngaben(k)]);
  return (
    <BerichtAssistent
      projektId={id}
      berichtId={crypto.randomUUID()}
      art={art}
      startDatum={heuteIso()}
      start={leereDaten(art, k.nutzer.id)}
      gespeichertStart={false}
      info={info}
      personen={personen}
      fotos={fotos}
    />
  );
}
