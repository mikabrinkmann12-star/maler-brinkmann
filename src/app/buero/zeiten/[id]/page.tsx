import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { formatDatumZeit } from "@/lib/format";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { uhrzeitKurz } from "@/lib/zeiten";
import { bueroPersonen, personenNamen } from "@/lib/zeiten-buero-daten";
import { zeiterfassungEinstellungen } from "@/lib/zeiten-daten";
import { BueroZeitFormular } from "../buero-zeit-formular";

export const metadata: Metadata = { title: "Zeit ändern" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BueroZeitSeite({ params }: PageProps<"/buero/zeiten/[id]">) {
  await requireRole(BUERO_ROLLEN);
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("time_entries")
    .select("id, datum, von, bis, pause_min, stunden, art, beschreibung, user_id, erstellt_von, bearbeitet_von, project_id, archiviert_am, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!t || t.archiviert_am) notFound();

  const [personen, einstellungen, { data: projekte }] = await Promise.all([
    bueroPersonen(),
    zeiterfassungEinstellungen(),
    supabase.from("projects").select("id, name").is("archiviert_am", null).order("name"),
  ]);
  const namen = personenNamen(personen);
  const name = (uid: string | null) => (uid ? namen.get(uid) ?? "einem ehemaligen Nutzer" : "–");

  // Die Baustelle des Eintrags auch dann anbieten, wenn das Projekt inzwischen archiviert ist
  const projektListe = projekte ?? [];
  if (t.project_id && !projektListe.some((p) => p.id === t.project_id)) {
    const { data: p } = await supabase.from("projects").select("id, name").eq("id", t.project_id).maybeSingle();
    if (p) projektListe.push({ id: p.id, name: `${p.name} (archiviert)` });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/buero/zeiten?monat=${t.datum.slice(0, 7)}&person=${t.user_id}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Zeiten
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Zeit ändern</h1>
        <p className="text-sm text-muted-foreground">
          Eingetragen von {name(t.erstellt_von)} am {formatDatumZeit(t.created_at)}
          {t.bearbeitet_von && t.updated_at !== t.created_at && ` · zuletzt geändert von ${name(t.bearbeitet_von)} am ${formatDatumZeit(t.updated_at)}`}
        </p>
      </div>
      <BueroZeitFormular
        id={t.id}
        einstellungen={einstellungen}
        personen={[{ id: t.user_id, name: name(t.user_id) }]}
        projekte={projektListe}
        start={{
          userId: t.user_id,
          datum: t.datum,
          art: t.art,
          projektId: t.project_id ?? "",
          modus: t.von ? "uhrzeit" : "stunden",
          von: uhrzeitKurz(t.von),
          bis: uhrzeitKurz(t.bis),
          pauseMin: t.pause_min,
          stunden: Number(t.stunden),
          beschreibung: t.beschreibung ?? "",
        }}
      />
    </div>
  );
}
