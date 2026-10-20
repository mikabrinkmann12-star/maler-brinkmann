import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireBueroRecht } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { KontaktFormular } from "../../kontakt-formular";

export const metadata: Metadata = { title: "Kontakt bearbeiten" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KontaktBearbeitenSeite({ params }: PageProps<"/buero/kontakte/[id]/bearbeiten">) {
  await requireBueroRecht("kontakte_bearbeiten");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: k } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!k) notFound();
  const s = (v: string | null) => v ?? "";

  return (
    <KontaktFormular
      id={id}
      zurueck={`/buero/kontakte/${id}`}
      start={{
        typ: k.typ, kundennummer: s(k.kundennummer), firmenname: s(k.firmenname), anrede: s(k.anrede), vorname: s(k.vorname),
        nachname: s(k.nachname), ansprechpartner: s(k.ansprechpartner), email: s(k.email), telefon: s(k.telefon), mobil: s(k.mobil),
        website: s(k.website), strasse: s(k.strasse), plz: s(k.plz), ort: s(k.ort), land: k.land || "Deutschland", farbe: s(k.farbe),
        empfaenger: s(k.empfaenger),
        zahlungsziel_tage: k.zahlungsziel_tage === null ? "" : String(k.zahlungsziel_tage),
        skonto_prozent: k.skonto_prozent === null ? "" : String(k.skonto_prozent).replace(".", ","),
        skonto_tage: k.skonto_tage === null ? "" : String(k.skonto_tage),
        steuersatz: String(Number(k.steuersatz)), leitweg_id: s(k.leitweg_id), notizen: s(k.notizen),
      }}
    />
  );
}
