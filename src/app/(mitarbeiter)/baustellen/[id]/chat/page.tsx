import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { ChatAnsicht } from "./chat-ansicht";

export const metadata: Metadata = { title: "Chat" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChatSeite({ params }: { params: Promise<{ id: string }> }) {
  const nutzer = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: p }, { data: mitglied }, kollegen] = await Promise.all([
    supabase.from("projects").select("id, name, archiviert_am").eq("id", id).maybeSingle(),
    supabase.from("project_members").select("user_id").eq("project_id", id).eq("user_id", nutzer.id).maybeSingle(),
    kollegenLaden(),
  ]);
  const istBuero = istBueroRolle(nutzer.rolle);
  // Der Chat ist nur für das Team und das Büro da (auch bei archivierten Projekten, dann nur lesen)
  if (!p || (!istBuero && !mitglied)) notFound();

  const namen: Record<string, string> = {};
  for (const k of kollegen.values()) namen[k.id] = `${k.vorname} ${k.nachname}`.trim();

  return (
    <div className="flex flex-1 flex-col gap-3">
      <ChatAnsicht projektId={p.id} ichId={nutzer.id} ichVorname={nutzer.vorname} ichNachname={nutzer.nachname} istBuero={istBuero} darfSchreiben={!p.archiviert_am} namen={namen} />
    </div>
  );
}
