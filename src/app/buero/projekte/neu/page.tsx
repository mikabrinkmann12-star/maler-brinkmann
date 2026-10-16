import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { projektnummerVorschlag } from "@/lib/projektnummer-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { ProjektFormular } from "../projekt-formular";

export const metadata: Metadata = { title: "Neues Projekt" };

export default async function NeuesProjektSeite() {
  await requireRole(BUERO_ROLLEN);
  const supabase = await createClient();
  const [vorschlag, { data: status }, { data: buero }] = await Promise.all([
    projektnummerVorschlag(),
    supabase.from("project_statuses").select("id, name").eq("aktiv", true).order("sortierung"),
    supabase.from("profiles").select("id, vorname, nachname").in("rolle", ["buero", "admin"]).eq("aktiv", true).order("vorname"),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/buero/projekte" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Projekte
      </Link>
      <h1 className="text-2xl font-semibold">Neues Projekt</h1>
      <ProjektFormular
        id={null}
        status={status ?? []}
        buero={(buero ?? []).map((b) => ({ id: b.id, name: `${b.vorname} ${b.nachname}`.trim() }))}
        start={{
          projektnummer: vorschlag, name: "", kunde: null, statusId: status?.[0]?.id ?? "", strasse: "", plz: "", ort: "",
          startDatum: "", endDatum: "", beschreibung: "", bueroAnsprechpartnerId: "",
        }}
      />
    </div>
  );
}
