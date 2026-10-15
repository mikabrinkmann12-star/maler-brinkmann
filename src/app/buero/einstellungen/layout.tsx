import { requireRole } from "@/lib/auth";

// Einstellungen: nur Admin. Das Büro wird serverseitig zur Übersicht umgeleitet.
export default async function EinstellungenLayout({
  children,
}: LayoutProps<"/buero/einstellungen">) {
  await requireRole(["admin"]);
  return children;
}
