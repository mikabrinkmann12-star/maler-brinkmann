import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { LEERER_BAUTAGESBERICHT } from "@/lib/bericht";
import { berichtKontext, projektFotos } from "@/lib/bericht-daten";
import { heuteIso } from "@/lib/datum";
import { BerichtFormular } from "../bericht-formular";

export const metadata: Metadata = { title: "Neuer Bautagesbericht" };

export default async function NeuerBerichtSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const k = await berichtKontext(id);
  if (!k.darfSchreiben) notFound();
  const fotos = await projektFotos(k);

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/baustellen/${id}/berichte`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Berichte
      </Link>
      <h1 className="text-2xl font-semibold">Bautagesbericht</h1>
      <p className="-mt-2 text-muted-foreground">{k.projekt.name}</p>
      <BerichtFormular
        projektId={id}
        berichtId={crypto.randomUUID()}
        startDatum={heuteIso()}
        start={LEERER_BAUTAGESBERICHT}
        team={k.team}
        fotos={fotos}
      />
    </div>
  );
}
