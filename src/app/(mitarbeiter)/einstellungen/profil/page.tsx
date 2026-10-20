import type { Metadata } from "next";
import { SeitenKopf } from "@/components/layout/seiten-kopf";
import { requireUser } from "@/lib/auth";
import { initialen } from "@/lib/profil";
import { createClient } from "@/lib/supabase/server";
import { ProfilFormular } from "./profil-formular";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilSeite() {
  const nutzer = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("telefon").eq("id", nutzer.id).maybeSingle();

  return (
    <div className="flex flex-col gap-5">
      <SeitenKopf titel="Profil" zurueck="/einstellungen" />
      <div className="flex justify-center">
        <span className="flex size-24 items-center justify-center rounded-full bg-primary/15 text-3xl font-semibold text-primary">
          {initialen(nutzer.vorname, nutzer.nachname)}
        </span>
      </div>
      <ProfilFormular vorname={nutzer.vorname} nachname={nutzer.nachname} telefon={data?.telefon ?? ""} />
    </div>
  );
}
