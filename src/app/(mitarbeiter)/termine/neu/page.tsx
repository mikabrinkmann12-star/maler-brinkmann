import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRecht } from "@/lib/auth";
import { heuteIso, istIsoDatum } from "@/lib/datum";
import { meineProjektIds } from "@/lib/mitarbeiter-daten";
import { createClient } from "@/lib/supabase/server";
import { Warteschlange } from "../../warteschlange";
import { TerminFormular } from "../termin-formular";

export const metadata: Metadata = { title: "Termin eintragen" };

export default async function NeuerTerminSeite({ searchParams }: PageProps<"/termine/neu">) {
  const nutzer = await requireRecht("termine");
  const { datum } = await searchParams;
  const ids = await meineProjektIds(nutzer.id);
  const supabase = await createClient();
  const { data: projekte } = ids.length
    ? await supabase.from("projects").select("id, name, baustelle_ort").in("id", ids).is("archiviert_am", null).order("name")
    : { data: [] };

  return (
    <div className="flex flex-col gap-5">
      <Link href="/termine" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Meine Termine
      </Link>
      <h1 className="text-2xl font-semibold">Termin eintragen</h1>
      <Warteschlange userId={nutzer.id} />
      <TerminFormular
        ichId={nutzer.id}
        zurueck="/termine"
        startDatum={istIsoDatum(datum) ? datum : heuteIso()}
        darfPersonen={false}
        personen={[]}
        projekte={(projekte ?? []).map((p) => ({ id: p.id, name: p.name, ort: p.baustelle_ort ?? "" }))}
      />
    </div>
  );
}
