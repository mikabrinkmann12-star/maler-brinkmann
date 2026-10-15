import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppLogo } from "@/components/app-logo";
import { ladeSitzung } from "@/lib/auth";
import { startseiteFuer } from "@/lib/rollen";
import { LoginFormular } from "./login-formular";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginSeite({ searchParams }: PageProps<"/login">) {
  const sitzung = await ladeSitzung();
  if (sitzung.status === "ok") {
    redirect(
      sitzung.nutzer.mussPasswortAendern
        ? "/passwort-aendern"
        : startseiteFuer(sitzung.nutzer.rolle),
    );
  }

  const { grund } = await searchParams;
  const hinweis =
    sitzung.status === "gesperrt" || grund === "gesperrt"
      ? "Dein Zugang ist gesperrt. Bitte melde dich im Büro."
      : undefined;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <AppLogo className="size-14 text-lg" />
          <div>
            <h1 className="text-2xl font-semibold">Maler Brinkmann</h1>
            <p className="text-muted-foreground">Bitte melde dich an.</p>
          </div>
        </div>
        <LoginFormular hinweis={hinweis} />
      </div>
    </main>
  );
}
