import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { Warteschlange } from "../../../../(mitarbeiter)/warteschlange";
import { TerminFormular } from "../../../../(mitarbeiter)/termine/termin-formular";

export const metadata: Metadata = { title: "Termin" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BueroTerminSeite({ params }: PageProps<"/buero/plantafel/termine/[id]">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: t }, { data: projekte }, { data: profile }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, datum, titel, zeit, ort, notiz, project_id, archiviert_am, appointment_members(user_id)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("projects").select("id, name, baustelle_ort").is("archiviert_am", null).order("name"),
    supabase.from("profiles").select("id, vorname, nachname").eq("aktiv", true).order("vorname"),
  ]);
  if (!t || t.archiviert_am) notFound();

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <Link href="/buero/plantafel/termine" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Termine
      </Link>
      <h1 className="text-2xl font-semibold">Termin ändern</h1>
      <Warteschlange userId={nutzer.id} />
      <TerminFormular
        ichId={nutzer.id}
        zurueck="/buero/plantafel/termine"
        startDatum={t.datum}
        darfPersonen
        personen={(profile ?? []).map((p) => ({ id: p.id, name: `${p.vorname} ${p.nachname}`.trim() }))}
        projekte={(projekte ?? []).map((p) => ({ id: p.id, name: p.name, ort: p.baustelle_ort ?? "" }))}
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
