import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { requireBueroRecht } from "@/lib/auth";
import { angebotLaden } from "@/lib/angebot-daten";
import { createClient } from "@/lib/supabase/server";
import { FlaechenRechner, type LeistungAuswahl } from "./flaechen-rechner";

export const metadata: Metadata = { title: "Flächen aus Grundriss" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Flächenberechnung aus dem Grundriss für ein Angebot: Räume lesen, prüfen, Leistungen wählen, Positionen anhängen. */
export default async function FlaechenSeite({ params }: PageProps<"/buero/angebote/[id]/flaechen">) {
  await requireBueroRecht("angebote");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await angebotLaden(id);
  if (!detail) notFound();
  const { angebot: a, projekt } = detail;
  const gesperrt = a.status !== "entwurf" || a.archiviert;

  // Leistungen mit Verkaufspreis aus den Stammdaten (nur zur Auswahl; beim Übernehmen liest der Server den Preis neu)
  const supabase = await createClient();
  const { data } = await supabase.from("services").select("id, name, nummer, einheit, vk").is("archiviert_am", null).order("name").limit(1000);
  const leistungen: LeistungAuswahl[] = (data ?? []).map((s) => ({ id: s.id, name: s.name, nummer: s.nummer ?? "", einheit: s.einheit, vk: Number(s.vk) }));

  return (
    <div className="flex max-w-7xl flex-col gap-5">
      <Link href={`/buero/angebote/${id}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Zurück zum Angebot
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Flächen aus Grundriss</h1>
        <p className="text-sm text-muted-foreground">
          {a.betreff} · Projekt {projekt.projektnummer} · {projekt.name}
        </p>
      </div>
      {gesperrt && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <LockIcon className="size-4 shrink-0" />
          Dieses Angebot ist gesperrt. Du kannst rechnen, aber nichts übernehmen. Setze es zuerst zurück auf Entwurf.
        </p>
      )}
      <FlaechenRechner angebotId={id} gesperrt={gesperrt} leistungen={leistungen} />
    </div>
  );
}
