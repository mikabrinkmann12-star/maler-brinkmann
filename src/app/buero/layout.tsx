import { BueroRahmen } from "@/components/layout/buero-rahmen";
import { requireRole } from "@/lib/auth";
import { firmaLaden } from "@/lib/firma-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";

// Büro-Ansicht: nur Admin und Büro. Mitarbeiter werden serverseitig umgeleitet.
export default async function BueroLayout({ children }: LayoutProps<"/buero">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const name = `${nutzer.vorname} ${nutzer.nachname}`.trim();
  const firma = await firmaLaden();

  return (
    <BueroRahmen firmenname={firma.name || "Meine Firma"} name={name} rolle={nutzer.rolle}>
      {children}
    </BueroRahmen>
  );
}
