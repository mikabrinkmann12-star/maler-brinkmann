import type { Metadata } from "next";
import { SeitenKopf } from "@/components/layout/seiten-kopf";
import { requireUser } from "@/lib/auth";
import { zeitFormularDaten } from "@/lib/zeiten-daten";
import { Warteschlange } from "../../warteschlange";
import { ZeitFormular } from "../zeit-formular";

export const metadata: Metadata = { title: "Zeit eintragen" };

export default async function NeueZeitSeite({ searchParams }: PageProps<"/zeiten/neu">) {
  const nutzer = await requireUser();
  const { projekt } = await searchParams;
  const daten = await zeitFormularDaten(nutzer);

  return (
    <div className="flex flex-col gap-5">
      <SeitenKopf titel="Neue Zeit" zurueck="/zeiten" />
      <Warteschlange userId={nutzer.id} />
      <ZeitFormular daten={daten} startProjektId={typeof projekt === "string" ? projekt : undefined} />
    </div>
  );
}
