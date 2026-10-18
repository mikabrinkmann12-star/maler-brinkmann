import Link from "next/link";
import { HardHatIcon, KeyRoundIcon, LogOutIcon } from "lucide-react";
import { abmelden } from "@/lib/auth-aktionen";
import { ROLLEN_NAMEN, type Rolle } from "@/lib/rollen";

const KNOPF =
  "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";

/** Unterer Bereich der Sidebar: wer ist eingeloggt, Umschalter, Abmelden. */
export function NutzerBereich({
  name,
  rolle,
  onNavigiert,
}: {
  name: string;
  rolle: Rolle;
  onNavigiert?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-sidebar-border pt-3">
      <div className="px-3 pb-2">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-sidebar-foreground/60">{ROLLEN_NAMEN[rolle]}</p>
      </div>
      <Link href="/heute" onClick={onNavigiert} className={KNOPF}>
        <HardHatIcon className="size-5" />
        Zur Mitarbeiter-Ansicht
      </Link>
      <Link href="/passwort-aendern" onClick={onNavigiert} className={KNOPF}>
        <KeyRoundIcon className="size-5" />
        Passwort ändern
      </Link>
      <form action={abmelden}>
        <button type="submit" className={KNOPF}>
          <LogOutIcon className="size-5" />
          Abmelden
        </button>
      </form>
    </div>
  );
}
