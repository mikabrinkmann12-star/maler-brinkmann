import type { Metadata } from "next";
import { SeitenKopf } from "@/components/layout/seiten-kopf";
import { requireUser } from "@/lib/auth";
import { benachrichtigungenLesen } from "@/lib/profil";
import { createClient } from "@/lib/supabase/server";
import { Schalter } from "./schalter";

export const metadata: Metadata = { title: "Benachrichtigungen" };

export default async function BenachrichtigungenSeite() {
  const nutzer = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("benachrichtigungen").eq("id", nutzer.id).maybeSingle();

  return (
    <div className="flex flex-col gap-4">
      <SeitenKopf titel="Benachrichtigungen" zurueck="/einstellungen" />
      <Schalter start={benachrichtigungenLesen(data?.benachrichtigungen)} />
    </div>
  );
}
