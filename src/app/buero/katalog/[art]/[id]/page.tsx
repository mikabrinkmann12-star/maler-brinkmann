import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireBueroRecht } from "@/lib/auth";
import { formatDatumZeit } from "@/lib/format";
import { istKatalogArt, preisFuerFeld, ordnerPfadText } from "@/lib/katalog";
import { kalkulationAusJson } from "@/lib/kalkulation";
import { kalkulationLaden } from "@/lib/kalkulation-daten";
import { ordnerLaden } from "@/lib/katalog-daten";
import { createClient } from "@/lib/supabase/server";
import { KatalogFormular, type KatalogStart } from "../../katalog-formular";

export const metadata: Metadata = { title: "Katalog-Eintrag" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KatalogEintragSeite({ params }: PageProps<"/buero/katalog/[art]/[id]">) {
  await requireBueroRecht("katalog");
  const { art, id } = await params;
  if (!istKatalogArt(art) || !UUID.test(id)) notFound();

  const supabase = await createClient();
  let start: KatalogStart;
  let archiviertAm: string | null;
  let geaendert: string;
  let kalkulationStart: ReturnType<typeof kalkulationAusJson> = null;

  if (art === "material") {
    const { data: m } = await supabase.from("materials")
      .select("folder_id, artikelnr, name, beschreibung, lieferant, einheit, ek, zuschlag_prozent, archiviert_am, updated_at").eq("id", id).maybeSingle();
    if (!m) notFound();
    start = {
      folderId: m.folder_id ?? "", nummer: m.artikelnr ?? "", name: m.name, text: m.beschreibung ?? "", lieferant: m.lieferant ?? "",
      einheit: m.einheit, preis: preisFuerFeld(Number(m.ek)), zuschlag: String(Number(m.zuschlag_prozent)).replace(".", ","),
    };
    archiviertAm = m.archiviert_am;
    geaendert = m.updated_at;
  } else {
    const { data: s } = await supabase.from("services")
      .select("folder_id, nummer, name, langtext, einheit, kosten, zuschlag_prozent, kalkulation, archiviert_am, updated_at").eq("id", id).maybeSingle();
    if (!s) notFound();
    start = {
      folderId: s.folder_id ?? "", nummer: s.nummer ?? "", name: s.name, text: s.langtext ?? "", lieferant: "",
      einheit: s.einheit, preis: preisFuerFeld(Number(s.kosten)), zuschlag: String(Number(s.zuschlag_prozent)).replace(".", ","),
    };
    archiviertAm = s.archiviert_am;
    geaendert = s.updated_at;
    kalkulationStart = kalkulationAusJson(s.kalkulation);
  }

  const alle = await ordnerLaden(art);
  const aktive = alle.filter((o) => !o.archiviert);
  // Liegt der Eintrag in einem archivierten Ordner, bleibt der Ordner ausgewählt, damit nichts verloren geht
  const ordnerArchiviert = start.folderId !== "" && !aktive.some((o) => o.id === start.folderId);
  const ordner = ordnerArchiviert ? alle.filter((o) => !o.archiviert || o.id === start.folderId) : aktive;

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/buero/katalog?art=${art}${start.folderId && !ordnerArchiviert ? `&ordner=${start.folderId}` : ""}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Katalog
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{art === "material" ? "Material" : "Leistung"} ändern</h1>
        <p className="text-sm text-muted-foreground">
          {ordnerPfadText(alle, start.folderId || null) || "Ohne Ordner"} · zuletzt geändert am {formatDatumZeit(geaendert)}
        </p>
      </div>
      <KatalogFormular art={art} id={id} start={start} ordner={ordner} archiviert={archiviertAm != null} kalkulation={art === "leistung" ? await kalkulationLaden() : undefined} kalkulationStart={kalkulationStart} />
    </div>
  );
}
