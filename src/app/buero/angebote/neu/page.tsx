import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireBueroRecht } from "@/lib/auth";
import { projekteFuerAngebot } from "@/lib/angebot-daten";
import { createClient } from "@/lib/supabase/server";
import { NeuesAngebotFormular } from "./neues-angebot-formular";

export const metadata: Metadata = { title: "Neues Dokument" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NeuesAngebotSeite({ searchParams }: PageProps<"/buero/angebote/neu">) {
  await requireBueroRecht("angebote");
  const params = await searchParams;
  const artParam = typeof params.art === "string" ? params.art : "";
  const projektParam = typeof params.projekt === "string" && UUID.test(params.projekt) ? params.projekt : "";

  const projekte = await projekteFuerAngebot();
  let projektId = "";
  let betreff = "";
  if (projektParam) {
    // Aus dem Projekt heraus: das Projekt ist vorgewählt (auch wenn es nicht unter den 500 neuesten ist)
    const supabase = await createClient();
    const { data } = await supabase.from("projects").select("id, name, projektnummer, archiviert_am").eq("id", projektParam).maybeSingle();
    if (data && !data.archiviert_am) {
      projektId = data.id;
      betreff = data.name;
      if (!projekte.some((p) => p.id === data.id)) projekte.unshift({ id: data.id, label: `${data.projektnummer} · ${data.name}` });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/buero/angebote" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Angebote
      </Link>
      <h1 className="text-2xl font-semibold">Neues Dokument</h1>
      <NeuesAngebotFormular projekte={projekte} projektId={projektId} betreffStart={betreff} artStart={artParam} />
    </div>
  );
}
