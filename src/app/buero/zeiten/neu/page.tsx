import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireBueroRecht } from "@/lib/auth";
import { heuteIso, istIsoDatum } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { tagesStandard } from "@/lib/zeiten";
import { bueroPersonen } from "@/lib/zeiten-buero-daten";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";
import { BueroZeitFormular } from "../buero-zeit-formular";

export const metadata: Metadata = { title: "Zeit nachtragen" };

export default async function ZeitNachtragenSeite({ searchParams }: PageProps<"/buero/zeiten/neu">) {
  await requireBueroRecht("zeiten_alle");
  const params = await searchParams;

  const supabase = await createClient();
  const [personen, einstellungen, { data: projekte }] = await Promise.all([
    bueroPersonen(),
    zeiterfassungEinstellungen(),
    supabase.from("projects").select("id, name").is("archiviert_am", null).order("name"),
  ]);
  const aktive = personen.filter((p) => p.aktiv);

  const person = typeof params.person === "string" && aktive.some((p) => p.id === params.person) ? params.person : "";
  const datum = typeof params.datum === "string" && istIsoDatum(params.datum) ? params.datum : heuteIso();
  const standard = tagesStandard(datum, einstellungen);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/buero/zeiten" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Zeiten
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Zeit nachtragen</h1>
        <p className="text-sm text-muted-foreground">
          Für jeden Mitarbeiter und jeden Tag, auch nach der Sperrfrist. Der Eintrag wird mit deinem Namen als Ersteller gespeichert.
        </p>
      </div>
      <BueroZeitFormular
        id={null}
        einstellungen={einstellungen}
        personen={aktive.map((p) => ({ id: p.id, name: p.name }))}
        projekte={projekte ?? []}
        start={{
          userId: person,
          datum,
          art: "arbeitszeit",
          projektId: "",
          modus: "uhrzeit",
          von: standard.standardBeginn,
          bis: standard.standardEnde,
          pauseMin: standard.standardPauseMin,
          stunden: 0,
          beschreibung: "",
        }}
      />
    </div>
  );
}
