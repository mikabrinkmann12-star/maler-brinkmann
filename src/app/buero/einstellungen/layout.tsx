import { requireRole } from "@/lib/auth";
import { EinstellungenMenue } from "./einstellungen-menue";

// Einstellungen: nur Admin. Das Büro wird serverseitig zur Übersicht umgeleitet.
// Aufbau wie in Plancraft: links das gruppierte Menü, rechts die gewählte Seite.
export default async function EinstellungenLayout({ children }: LayoutProps<"/buero/einstellungen">) {
  await requireRole(["admin"]);
  return (
    <div className="grid items-start gap-6 md:grid-cols-[14.5rem_minmax(0,1fr)]">
      <aside className="rounded-lg border bg-white p-2 md:sticky md:top-6">
        <EinstellungenMenue />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
