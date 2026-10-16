import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { kontaktAnzeigename } from "@/lib/kontakt-schema";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { KontaktFormular } from "../../kontakt-formular";

export const metadata: Metadata = { title: "Kontakt bearbeiten" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function KontaktBearbeitenSeite({ params }: PageProps<"/buero/kontakte/[id]/bearbeiten">) {
  await requireRole(BUERO_ROLLEN);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: k } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!k) notFound();
  const s = (v: string | null) => v ?? "";

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/buero/kontakte/${id}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> {kontaktAnzeigename(k)}
      </Link>
      <h1 className="text-2xl font-semibold">Kontakt bearbeiten</h1>
      <KontaktFormular
        id={id}
        start={{
          typ: k.typ, kundennummer: s(k.kundennummer), firmenname: s(k.firmenname), anrede: s(k.anrede), vorname: s(k.vorname),
          nachname: s(k.nachname), ansprechpartner: s(k.ansprechpartner), email: s(k.email), telefon: s(k.telefon), mobil: s(k.mobil),
          website: s(k.website), strasse: s(k.strasse), plz: s(k.plz), ort: s(k.ort), empfaenger: s(k.empfaenger),
          zahlungsziel_tage: k.zahlungsziel_tage === null ? "" : String(k.zahlungsziel_tage),
          skonto_prozent: k.skonto_prozent === null ? "" : String(k.skonto_prozent).replace(".", ","),
          skonto_tage: k.skonto_tage === null ? "" : String(k.skonto_tage),
          steuersatz: String(Number(k.steuersatz)), notizen: s(k.notizen),
        }}
      />
    </div>
  );
}
