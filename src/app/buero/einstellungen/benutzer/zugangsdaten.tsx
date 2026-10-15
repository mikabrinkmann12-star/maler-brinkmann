"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Zeigt Zugangsdaten zum Weitergeben an den Mitarbeiter (einmalig).
 * Das Startpasswort wird nirgends gespeichert.
 */
export function Zugangsdaten({
  benutzername,
  passwort,
}: {
  benutzername?: string;
  passwort: string;
}) {
  const adresse = typeof window === "undefined" ? "" : window.location.origin;
  const text = [
    `Adresse: ${adresse}`,
    benutzername ? `Benutzername: ${benutzername}` : null,
    `Startpasswort: ${passwort}`,
  ]
    .filter(Boolean)
    .join("\n");

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Zugangsdaten kopiert");
    } catch {
      toast.error("Kopieren hat nicht geklappt. Bitte abschreiben.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-muted p-4 text-base">
        <dt className="text-muted-foreground">Adresse</dt>
        <dd className="break-all">{adresse}</dd>
        {benutzername && (
          <>
            <dt className="text-muted-foreground">Benutzername</dt>
            <dd className="font-mono font-semibold">{benutzername}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Startpasswort</dt>
        <dd className="font-mono font-semibold break-all">{passwort}</dd>
      </dl>
      <Button type="button" variant="outline" size="lg" onClick={kopieren} className="w-fit">
        <CopyIcon />
        Zugangsdaten kopieren
      </Button>
      <p className="text-sm text-muted-foreground">
        Beim ersten Anmelden muss ein eigenes Passwort festgelegt werden. Das
        Startpasswort wird nur jetzt angezeigt.
      </p>
    </div>
  );
}
