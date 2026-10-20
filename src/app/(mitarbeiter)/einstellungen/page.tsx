import type { Metadata } from "next";
import {
  BellIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  InfoIcon,
  KeyRoundIcon,
  LogOutIcon,
  TreePalmIcon,
  UserIcon,
} from "lucide-react";
import { AppInstallieren } from "@/components/app-installieren";
import { EinstellungsZeile } from "@/components/layout/einstellungs-zeile";
import { SeitenKopf } from "@/components/layout/seiten-kopf";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { abmelden } from "@/lib/auth-aktionen";
import { initialen } from "@/lib/profil";
import { EIGENE_VERSION } from "@/lib/pwa";
import { ROLLEN_NAMEN, istBueroRolle } from "@/lib/rollen";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function EinstellungenSeite() {
  const nutzer = await requireUser();

  return (
    <div className="flex flex-col gap-5">
      <SeitenKopf titel="Einstellungen" zurueck="/heute" />

      <div className="flex items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary">
          {initialen(nutzer.vorname, nutzer.nachname)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">
            {nutzer.vorname} {nutzer.nachname}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {ROLLEN_NAMEN[nutzer.rolle]} · {nutzer.benutzername}
          </p>
        </div>
      </div>

      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        <li><EinstellungsZeile href="/einstellungen/profil" icon={<UserIcon />} text="Profil" /></li>
        <li><EinstellungsZeile href="/einstellungen/benachrichtigungen" icon={<BellIcon />} text="Benachrichtigungen" /></li>
        <li><EinstellungsZeile href="/termine" icon={<CalendarClockIcon />} text="Meine Termine" /></li>
        <li><EinstellungsZeile href="/urlaub" icon={<TreePalmIcon />} text="Urlaub beantragen" /></li>
        <li><EinstellungsZeile href="/passwort-aendern" icon={<KeyRoundIcon />} text="Passwort ändern" /></li>
        <li><EinstellungsZeile href="/einstellungen/informationen" icon={<InfoIcon />} text="Informationen" /></li>
        {istBueroRolle(nutzer.rolle) && (
          <li><EinstellungsZeile href="/buero" icon={<BriefcaseIcon />} text="Zur Büro-Ansicht" /></li>
        )}
      </ul>

      <form action={abmelden}>
        <Button type="submit" variant="outline" size="touch" className="w-full justify-start bg-card">
          <LogOutIcon />
          Abmelden
        </Button>
      </form>

      <AppInstallieren />

      <p className="text-center text-xs text-muted-foreground">
        Maler Brinkmann · Version {EIGENE_VERSION.slice(0, 7)}
      </p>
    </div>
  );
}
