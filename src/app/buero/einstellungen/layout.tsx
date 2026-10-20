import { redirect } from "next/navigation";
import { ladeRechte, requireRole } from "@/lib/auth";
import { rechtOk } from "@/lib/rechte";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { EinstellungenMenue } from "./einstellungen-menue";

// Einstellungen: der Admin sieht alles. Das Büro sieht nur die Bereiche, die der Admin ihm unter „Rollen & Zugriffsrechte“ erlaubt hat
// (Firmeneinstellungen, Kalkulation); sonst geht es zur Übersicht. Jede Seite und jede Aktion prüft ihr Recht selbst.
// Aufbau wie in Plancraft: links das gruppierte Menü, rechts die gewählte Seite.
export default async function EinstellungenLayout({ children }: LayoutProps<"/buero/einstellungen">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const rechte = await ladeRechte();
  const istAdmin = nutzer.rolle === "admin";
  if (!istAdmin && !rechtOk(rechte, "einstellungen_firma") && !rechtOk(rechte, "kalkulation_aendern")) redirect("/buero");
  return (
    <div className="grid items-start gap-6 md:grid-cols-[14.5rem_minmax(0,1fr)]">
      <aside className="rounded-lg border bg-white p-2 md:sticky md:top-6">
        <EinstellungenMenue istAdmin={istAdmin} rechte={rechte} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
