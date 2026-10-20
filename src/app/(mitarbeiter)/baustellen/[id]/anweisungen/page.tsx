import type { Metadata } from "next";
import { projektKontext } from "@/lib/projekt-kontext";
import { Projektliste } from "../arbeitsanweisung";

export const metadata: Metadata = { title: "Arbeitsanweisungen" };

// Reiter „Arbeitsanweisungen“: Arbeitsanweisung und Materialliste (ohne Preise, nach Freigabe).
export default async function AnweisungenSeite({ params }: PageProps<"/baustellen/[id]/anweisungen">) {
  const { id } = await params;
  const k = await projektKontext(id);

  return (
    <div className="flex flex-col gap-6">
      <Projektliste projektId={id} art="arbeitsanweisung" istBuero={k.istBuero} archiviert={k.archiviert} />
      <Projektliste projektId={id} art="materialliste" istBuero={k.istBuero} archiviert={k.archiviert} />
    </div>
  );
}
