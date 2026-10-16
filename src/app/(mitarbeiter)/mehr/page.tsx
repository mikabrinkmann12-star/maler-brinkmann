import type { Metadata } from "next";
import Link from "next/link";
import { BriefcaseIcon, KeyRoundIcon, LogOutIcon, TreePalmIcon } from "lucide-react";
import { AppInstallieren } from "@/components/app-installieren";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { abmelden } from "@/lib/auth-aktionen";
import { ROLLEN_NAMEN, istBueroRolle } from "@/lib/rollen";

export const metadata: Metadata = { title: "Mehr" };

const GROSSER_KNOPF = "w-full justify-start";

export default async function MehrSeite() {
  const nutzer = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {nutzer.vorname} {nutzer.nachname}
        </h1>
        <p className="text-muted-foreground">
          {ROLLEN_NAMEN[nutzer.rolle]} · Benutzername: {nutzer.benutzername}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/urlaub"
          className={buttonVariants({ variant: "outline", size: "touch", className: GROSSER_KNOPF })}
        >
          <TreePalmIcon />
          Urlaub beantragen
        </Link>

        <Link
          href="/passwort-aendern"
          className={buttonVariants({ variant: "outline", size: "touch", className: GROSSER_KNOPF })}
        >
          <KeyRoundIcon />
          Passwort ändern
        </Link>

        {istBueroRolle(nutzer.rolle) && (
          <Link
            href="/buero"
            className={buttonVariants({ variant: "outline", size: "touch", className: GROSSER_KNOPF })}
          >
            <BriefcaseIcon />
            Zur Büro-Ansicht
          </Link>
        )}

        <form action={abmelden}>
          <Button type="submit" variant="outline" size="touch" className={GROSSER_KNOPF}>
            <LogOutIcon />
            Abmelden
          </Button>
        </form>
      </div>

      <AppInstallieren />
    </div>
  );
}
