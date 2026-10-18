import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { ProjektFormular } from "../../projekt-formular";

export const metadata: Metadata = { title: "Projekt bearbeiten" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjektBearbeitenSeite({ params }: PageProps<"/buero/projekte/[id]/bearbeiten">) {
  await requireRole(BUERO_ROLLEN);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: p }, { data: status }, { data: buero }, { data: mitglieder }, kollegen] = await Promise.all([
    supabase
      .from("projects")
      .select("*, contacts(id, firmenname, vorname, nachname, kundennummer, strasse, plz, ort, land)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("project_statuses").select("id, name, farbe").eq("aktiv", true).order("sortierung"),
    supabase.from("profiles").select("id, vorname, nachname").in("rolle", ["buero", "admin"]).eq("aktiv", true).order("vorname"),
    supabase.from("project_members").select("user_id").eq("project_id", id),
    kollegenLaden(),
  ]);
  if (!p) notFound();
  const k = p.contacts;
  // Aktuellen Status auch anbieten, falls er inzwischen deaktiviert wurde
  const statusListe = [...(status ?? [])];
  if (!statusListe.some((s) => s.id === p.status_id)) {
    const { data: aktuell } = await supabase.from("project_statuses").select("id, name, farbe").eq("id", p.status_id).maybeSingle();
    if (aktuell) statusListe.push(aktuell);
  }

  const personen = [...kollegen.values()].map((x) => ({ id: x.id, name: `${x.vorname} ${x.nachname}`.trim() })).sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <ProjektFormular
      id={id}
      status={statusListe}
      buero={(buero ?? []).map((b) => ({ id: b.id, name: `${b.vorname} ${b.nachname}`.trim() }))}
      personen={personen}
      heute={heuteIso()}
      zurueck={`/baustellen/${id}`}
      start={{
        projektnummer: p.projektnummer,
        name: p.name,
        kunde: k
          ? {
              id: k.id,
              name: k.firmenname || [k.vorname, k.nachname].filter(Boolean).join(" ") || "Ohne Namen",
              kundennummer: k.kundennummer ?? "", strasse: k.strasse ?? "", plz: k.plz ?? "", ort: k.ort ?? "", land: k.land ?? "Deutschland",
            }
          : null,
        statusId: p.status_id,
        strasse: p.baustelle_strasse ?? "", plz: p.baustelle_plz ?? "", ort: p.baustelle_ort ?? "", land: p.land ?? "Deutschland",
        startDatum: p.start_datum ?? "", endDatum: p.end_datum ?? "", beschreibung: p.beschreibung ?? "",
        bueroAnsprechpartnerId: p.buero_ansprechpartner_id ?? "",
        mitarbeiterIds: (mitglieder ?? []).map((m) => m.user_id),
      }}
    />
  );
}
