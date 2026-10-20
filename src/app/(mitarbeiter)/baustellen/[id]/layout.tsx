import { notFound } from "next/navigation";
import { ProjektKopf } from "@/components/layout/projekt-kopf";
import { ladeRechte, requireUser } from "@/lib/auth";
import { rechtOk } from "@/lib/rechte";
import { ungelesenKarte, zaehlerText } from "@/lib/chat";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Gemeinsamer Kopf aller Reiter eines Projekts (Infos, Chat, Berichte, Ablage …).
// Jede Seite prüft ihre Rechte trotzdem selbst.
export default async function ProjektLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const nutzer = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: p }, { data: mitglied }, { data: ungelesen }] = await Promise.all([
    supabase.from("projects").select("id, name, archiviert_am").eq("id", id).maybeSingle(),
    supabase.from("project_members").select("user_id").eq("project_id", id).eq("user_id", nutzer.id).maybeSingle(),
    supabase.rpc("chat_ungelesen"),
  ]);
  if (!p) notFound();
  const istBuero = istBueroRolle(nutzer.rolle);
  const istMitglied = Boolean(mitglied);
  // Chat und Berichte sehen nur das Team und das Büro (auch bei archivierten Projekten)
  const darfTeamBereiche = istBuero || istMitglied;
  const neu = ungelesenKarte(ungelesen).get(id) ?? 0;
  const rechte = await ladeRechte();

  return (
    <div className="flex flex-1 flex-col">
      <ProjektKopf
        projektId={p.id}
        name={p.name}
        zurueck={p.archiviert_am && !istMitglied ? "/baustellen/archiv" : istBuero ? "/buero/projekte" : "/baustellen"}
        zeigeChat={darfTeamBereiche && rechtOk(rechte, "chat")}
        zeigeBerichte={darfTeamBereiche && rechtOk(rechte, "berichte")}
        zeigeAnweisungen={rechtOk(rechte, "anweisungen_ansehen")}
        zeigeMaterial={rechtOk(rechte, "baustelle_eintragen")}
        chatNeu={neu > 0 ? zaehlerText(neu) : ""}
      />
      {children}
    </div>
  );
}
