import { BueroRahmen } from "@/components/layout/buero-rahmen";
import { ladeRechte, requireRole } from "@/lib/auth";
import { ungelesenZaehler } from "@/lib/benachrichtigung-daten";
import { einheitenLaden } from "@/lib/einheiten-daten";
import { firmaLaden } from "@/lib/firma-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";

// Büro-Ansicht: nur Admin und Büro. Mitarbeiter werden serverseitig umgeleitet.
export default async function BueroLayout({ children }: LayoutProps<"/buero">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const name = `${nutzer.vorname} ${nutzer.nachname}`.trim();
  const [firma, ungelesen, einheiten, rechte] = await Promise.all([firmaLaden(), ungelesenZaehler(), einheitenLaden(), ladeRechte()]);

  return (
    <BueroRahmen firmenname={firma.name || "Meine Firma"} name={name} rolle={nutzer.rolle} rechte={rechte} ungelesen={ungelesen} einheiten={einheiten}>
      {children}
    </BueroRahmen>
  );
}
