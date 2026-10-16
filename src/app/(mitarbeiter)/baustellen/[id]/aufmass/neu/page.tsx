import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { aufmassLaden, baustelleMitRechten } from "@/lib/baustellen-daten";
import { Warteschlange } from "../../../../warteschlange";
import { AufmassFormular } from "../aufmass-formular";

export const metadata: Metadata = { title: "Aufmaß hinzufügen" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NeuesAufmassSeite({ params }: PageProps<"/baustellen/[id]/aufmass/neu">) {
  const nutzer = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const rechte = await baustelleMitRechten(nutzer, id);
  if (!rechte) notFound();
  if (!rechte.darfInhalte) redirect(`/baustellen/${id}/aufmass`);
  const zeilen = await aufmassLaden(id);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/baustellen/${id}/aufmass`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Aufmaß {rechte.projekt.name}
      </Link>
      <h1 className="text-2xl font-semibold">Aufmaß hinzufügen</h1>
      <Warteschlange userId={nutzer.id} />
      <AufmassFormular
        projektId={id}
        ichId={nutzer.id}
        raeume={[...new Set(zeilen.map((z) => z.raum))]}
        positionen={[...new Set(zeilen.map((z) => z.position))]}
      />
    </div>
  );
}
