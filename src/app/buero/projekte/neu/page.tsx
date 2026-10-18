import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { projektnummerVorschlag } from "@/lib/projektnummer-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { ProjektFormular } from "../projekt-formular";

export const metadata: Metadata = { title: "Neues Projekt" };

export default async function NeuesProjektSeite() {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const supabase = await createClient();
  const [vorschlag, { data: status }, { data: buero }, kollegen] = await Promise.all([
    projektnummerVorschlag(),
    supabase.from("project_statuses").select("id, name, farbe").eq("aktiv", true).order("sortierung"),
    supabase.from("profiles").select("id, vorname, nachname").in("rolle", ["buero", "admin"]).eq("aktiv", true).order("vorname"),
    kollegenLaden(),
  ]);
  const personen = [...kollegen.values()].map((k) => ({ id: k.id, name: `${k.vorname} ${k.nachname}`.trim() })).sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <ProjektFormular
      id={null}
      status={status ?? []}
      buero={(buero ?? []).map((b) => ({ id: b.id, name: `${b.vorname} ${b.nachname}`.trim() }))}
      personen={personen}
      vorschlag={vorschlag}
      heute={heuteIso()}
      zurueck="/buero/projekte"
      start={{
        projektnummer: "", name: "", kunde: null, statusId: status?.[0]?.id ?? "", strasse: "", plz: "", ort: "", land: "Deutschland",
        startDatum: "", endDatum: "", beschreibung: "", bueroAnsprechpartnerId: "",
        mitarbeiterIds: [nutzer.id], // wie in Plancraft: wer das Projekt anlegt, ist zuerst eingetragen
      }}
    />
  );
}
