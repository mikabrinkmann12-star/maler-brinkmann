import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { aufmassLaden, baustelleMitRechten } from "@/lib/baustellen-daten";
import { Warteschlange } from "../../../../warteschlange";
import { AufmassFormular } from "../aufmass-formular";

export const metadata: Metadata = { title: "Aufmaß ändern" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AufmassAendernSeite({ params }: PageProps<"/baustellen/[id]/aufmass/[mid]">) {
  const nutzer = await requireUser();
  const { id, mid } = await params;
  if (!UUID.test(id) || !UUID.test(mid)) notFound();
  const rechte = await baustelleMitRechten(nutzer, id);
  if (!rechte) notFound();
  const zeilen = await aufmassLaden(id);
  const zeile = zeilen.find((z) => z.id === mid);
  // Gelöscht/ersetzt oder fremd: zurück zur Liste
  if (!zeile || !rechte.darfAendern(zeile.erstelltVon) || rechte.projekt.archiviert_am) redirect(`/baustellen/${id}/aufmass`);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/baustellen/${id}/aufmass`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Aufmaß {rechte.projekt.name}
      </Link>
      <h1 className="text-2xl font-semibold">Aufmaß ändern</h1>
      <Warteschlange userId={nutzer.id} />
      <AufmassFormular
        projektId={id}
        ichId={nutzer.id}
        raeume={[...new Set(zeilen.map((z) => z.raum))]}
        positionen={[...new Set(zeilen.map((z) => z.position))]}
        bestehend={zeile}
      />
    </div>
  );
}
