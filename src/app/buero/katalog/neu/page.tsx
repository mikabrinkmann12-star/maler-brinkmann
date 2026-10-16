import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { istKatalogArt, type KatalogArt } from "@/lib/katalog";
import { ordnerLaden } from "@/lib/katalog-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { KatalogFormular } from "../katalog-formular";

export const metadata: Metadata = { title: "Neuer Katalog-Eintrag" };

export default async function KatalogNeuSeite({ searchParams }: PageProps<"/buero/katalog/neu">) {
  await requireRole(BUERO_ROLLEN);
  const params = await searchParams;
  const art: KatalogArt = istKatalogArt(params.art) ? params.art : "material";
  const aktive = (await ordnerLaden(art)).filter((o) => !o.archiviert);
  const ordner = typeof params.ordner === "string" && aktive.some((o) => o.id === params.ordner) ? params.ordner : "";

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/buero/katalog?art=${art}${ordner ? `&ordner=${ordner}` : ""}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Katalog
      </Link>
      <h1 className="text-2xl font-semibold">{art === "material" ? "Neues Material" : "Neue Leistung"}</h1>
      <KatalogFormular
        art={art}
        id={null}
        archiviert={false}
        ordner={aktive}
        start={{ folderId: ordner, nummer: "", name: "", text: "", lieferant: "", einheit: art === "material" ? "Stk" : "m²", preis: "", zuschlag: "" }}
      />
    </div>
  );
}
