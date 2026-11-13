import { AkzentAbgleich } from "@/components/akzent-abgleich";
import { AnsichtMerken } from "@/components/ansicht-merken";
import { BueroRahmen } from "@/components/layout/buero-rahmen";
import { requireRole } from "@/lib/auth";
import { bueroRahmenLaden } from "@/lib/buero-rahmen-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";

// Büro-Ansicht: nur Admin und Büro. Mitarbeiter werden serverseitig umgeleitet.
export default async function BueroLayout({ children }: LayoutProps<"/buero">) {
  const nutzer = await requireRole(BUERO_ROLLEN);
  const r = await bueroRahmenLaden(nutzer);

  return (
    <BueroRahmen {...r.rahmen}>
      <AkzentAbgleich akzent={r.akzent} />
      <AnsichtMerken ansicht="buero" />
      {children}
    </BueroRahmen>
  );
}
