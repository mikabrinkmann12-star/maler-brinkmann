import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { UntereNavigation } from "@/components/layout/untere-navigation";
import { requireUser } from "@/lib/auth";
import { istBueroRolle } from "@/lib/rollen";

// Mitarbeiter-Ansicht: für alle Rollen. Admin/Büro kommen über den Umschalter hierher.
export default async function MitarbeiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nutzer = await requireUser();

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
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-5 pb-28">
        {children}
      </main>
      <UntereNavigation />
    </div>
  );
}
