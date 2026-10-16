import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { heuteIso, istIsoDatum } from "@/lib/datum";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { Warteschlange } from "../../../../(mitarbeiter)/warteschlange";
import { TerminFormular } from "../../../../(mitarbeiter)/termine/termin-formular";

export const metadata: Metadata = { title: "Termin eintragen" };

export default async function BueroNeuerTerminSeite({ searchParams }: PageProps<"/buero/plantafel/termine/neu">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const { datum } = await searchParams;
  const supabase = await createClient();
  const [{ data: projekte }, { data: profile }] = await Promise.all([
    supabase.from("projects").select("id, name, baustelle_ort").is("archiviert_am", null).order("name"),
    supabase.from("profiles").select("id, vorname, nachname").eq("aktiv", true).order("vorname"),
  ]);

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <Link href="/buero/plantafel/termine" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Termine
      </Link>
      <h1 className="text-2xl font-semibold">Termin eintragen</h1>
      <Warteschlange userId={nutzer.id} />
      <TerminFormular
        ichId={nutzer.id}
        zurueck="/buero/plantafel/termine"
        startDatum={istIsoDatum(datum) ? datum : heuteIso()}
        darfPersonen
        personen={(profile ?? []).map((p) => ({ id: p.id, name: `${p.vorname} ${p.nachname}`.trim() }))}
        projekte={(projekte ?? []).map((p) => ({ id: p.id, name: p.name, ort: p.baustelle_ort ?? "" }))}
      />
    </div>
  );
}
