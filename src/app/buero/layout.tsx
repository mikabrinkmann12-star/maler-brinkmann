import { AppLogo } from "@/components/app-logo";
import { BueroMobilMenue } from "@/components/layout/buero-mobil-menue";
import { BueroNavigation } from "@/components/layout/buero-navigation";
import { NutzerBereich } from "@/components/layout/nutzer-bereich";
import { requireRole } from "@/lib/auth";
import { BUERO_ROLLEN } from "@/lib/rollen";

// Büro-Ansicht: nur Admin und Büro. Mitarbeiter werden serverseitig umgeleitet.
export default async function BueroLayout({ children }: LayoutProps<"/buero">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const name = `${nutzer.vorname} ${nutzer.nachname}`.trim();

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground md:flex">
        <div className="rounded-lg bg-white p-2">
          <AppLogo className="mx-auto w-40" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <BueroNavigation istAdmin={nutzer.rolle === "admin"} />
        </div>
        <NutzerBereich name={name} rolle={nutzer.rolle} />
      </aside>

      <div className="flex flex-1 flex-col md:pl-64">
        <BueroMobilMenue name={name} rolle={nutzer.rolle} />
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
