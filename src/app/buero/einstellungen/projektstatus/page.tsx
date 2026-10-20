import type { Metadata } from "next";
import { requireBueroRecht } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusVerwaltung } from "./status-verwaltung";

export const metadata: Metadata = { title: "Projektstatus" };

export default async function ProjektstatusSeite() {
  await requireBueroRecht("einstellungen_firma");
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_statuses").select("id, name, farbe, aktiv").order("sortierung").order("name");
  if (error) throw new Error("Die Projektstatus konnten nicht geladen werden.");

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Projektstatus</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Die Status, die ein Projekt haben kann (in der Projektliste direkt änderbar). Name und Farbe kannst du anpassen und die Reihenfolge mit den Pfeilen ändern.
        </p>
      </div>
      <StatusVerwaltung status={data} />
    </div>
  );
}
