import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { TabKopf, ZeiterfassungKnopf } from "@/components/layout/mitarbeiter-kopf";
import { UntereNavigation } from "@/components/layout/untere-navigation";
import { AkzentAbgleich } from "@/components/akzent-abgleich";
import { ladeRechte, requireUser } from "@/lib/auth";
import { darstellungLaden } from "@/lib/darstellung-daten";
import { rechtOk } from "@/lib/rechte";
import { istBueroRolle } from "@/lib/rollen";

// Mitarbeiter-Ansicht: für alle Rollen. Admin/Büro kommen über den Umschalter hierher.
export default async function MitarbeiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nutzer = await requireUser();
  const [rechte, darstellung] = await Promise.all([ladeRechte(), darstellungLaden()]);

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      {istBueroRolle(nutzer.rolle) && (
        <div className="flex items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <span>Mitarbeiter-Ansicht</span>
          <Link
            href="/buero"
            className="flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            <ArrowLeftIcon className="size-4" />
            Zurück ins Büro
          </Link>
        </div>
      )}
      <AkzentAbgleich akzent={darstellung.wirksam.akzent} glas={darstellung.wirksam.glas} />
      <TabKopf istBuero={istBueroRolle(nutzer.rolle)} />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-4 pb-28">
        {children}
      </main>
      {rechtOk(rechte, "zeiten_eigene") && <ZeiterfassungKnopf href="/zeiterfassung" />}
      <UntereNavigation rechte={rechte} />
    </div>
  );
}
