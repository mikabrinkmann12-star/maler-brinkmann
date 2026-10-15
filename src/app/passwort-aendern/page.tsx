import type { Metadata } from "next";
import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { abmelden } from "@/lib/auth-aktionen";
import { startseiteFuer } from "@/lib/rollen";
import { PasswortFormular } from "./passwort-formular";

export const metadata: Metadata = { title: "Passwort ändern" };

export default async function PasswortAendernSeite() {
  const nutzer = await requireUser({ passwortwechselErlaubt: true });

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <AppLogo className="size-14 text-lg" />
          <div>
            <h1 className="text-2xl font-semibold">
              {nutzer.mussPasswortAendern ? "Eigenes Passwort festlegen" : "Passwort ändern"}
            </h1>
            <p className="text-muted-foreground">
              {nutzer.mussPasswortAendern
                ? `Hallo ${nutzer.vorname}! Bitte lege jetzt dein eigenes Passwort fest. Das Startpasswort gilt danach nicht mehr.`
                : "Lege ein neues Passwort fest."}
            </p>
          </div>
        </div>

        <PasswortFormular />

        {nutzer.mussPasswortAendern ? (
          <form action={abmelden} className="text-center">
            <button
              type="submit"
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              Abmelden
            </button>
          </form>
        ) : (
          <Link
            href={startseiteFuer(nutzer.rolle)}
            className={buttonVariants({ variant: "ghost", size: "touch" })}
          >
            Abbrechen
          </Link>
        )}
      </div>
    </main>
  );
}
