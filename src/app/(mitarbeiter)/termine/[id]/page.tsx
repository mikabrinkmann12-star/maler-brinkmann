import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { meineProjektIds } from "@/lib/mitarbeiter-daten";
import { createClient } from "@/lib/supabase/server";
import { Warteschlange } from "../../warteschlange";
import { TerminFormular } from "../termin-formular";

export const metadata: Metadata = { title: "Termin" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TerminSeite({ params }: PageProps<"/termine/[id]">) {
  const nutzer = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("appointments")
    .select("id, datum, titel, zeit, ort, notiz, project_id, erstellt_von, archiviert_am, appointment_members(user_id)")
    .eq("id", id)
    .maybeSingle();
  const eigener = t && (t.erstellt_von === nutzer.id || t.appointment_members.some((m) => m.user_id === nutzer.id));
  if (!t || t.archiviert_am || !eigener) notFound(); // Mitarbeiter-Ansicht: nur eigene Termine

  const ids = await meineProjektIds(nutzer.id);
  const { data: projekte } = ids.length
    ? await supabase.from("projects").select("id, name, baustelle_ort").in("id", ids).is("archiviert_am", null).order("name")
    : { data: [] };
  const liste = (projekte ?? []).map((p) => ({ id: p.id, name: p.name, ort: p.baustelle_ort ?? "" }));
  // Verknüpfte Baustelle auch anbieten, wenn man dort nicht (mehr) Mitglied ist
  if (t.project_id && !liste.some((p) => p.id === t.project_id)) {
    const { data: p } = await supabase.from("projects").select("id, name, baustelle_ort").eq("id", t.project_id).maybeSingle();
    if (p) liste.push({ id: p.id, name: p.name, ort: p.baustelle_ort ?? "" });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/termine" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Meine Termine
      </Link>
      <h1 className="text-2xl font-semibold">Termin</h1>
      <Warteschlange userId={nutzer.id} />
      <TerminFormular
        ichId={nutzer.id}
        zurueck="/termine"
        startDatum={t.datum}
        darfPersonen={false}
        personen={[]}
        projekte={liste}
        darfAendern={t.erstellt_von === nutzer.id}
        bestehend={{
          id: t.id,
          datum: t.datum,
          titel: t.titel,
          zeit: t.zeit ? t.zeit.slice(0, 5) : "",
          ort: t.ort ?? "",
          projectId: t.project_id,
          notiz: t.notiz ?? "",
          personIds: t.appointment_members.map((m) => m.user_id),
        }}
      />
    </div>
  );
}
