import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
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
      <Link href="/zeiten" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Meine Zeiten
      </Link>
      <h1 className="text-2xl font-semibold">Zeit eintragen</h1>
      <Warteschlange userId={nutzer.id} />
      <ZeitFormular daten={daten} startProjektId={typeof projekt === "string" ? projekt : undefined} />
    </div>
  );
}
