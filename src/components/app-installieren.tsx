"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2Icon, DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  appInstallieren,
  installAngebotAbonnieren,
  installAngebotVorhanden,
} from "@/lib/pwa";

const STANDALONE = "(display-mode: standalone)";

function standaloneAbonnieren(f: () => void) {
  const abfrage = window.matchMedia(STANDALONE);
  abfrage.addEventListener("change", f);
  return () => abfrage.removeEventListener("change", f);
}

/** Bereich „App installieren“ für die Seite „Mehr“. */
export function AppInstallieren() {
  const angebot = useSyncExternalStore(
    installAngebotAbonnieren,
    installAngebotVorhanden,
    () => false,
  );
  const installiert = useSyncExternalStore(
    standaloneAbonnieren,
    () => window.matchMedia(STANDALONE).matches,
    () => false,
  );

  if (installiert) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2Icon className="size-4 text-green-600" />
        Die App ist auf diesem Gerät installiert.
      </p>
    );
  }

  if (angebot) {
    return (
      <Button
        type="button"
        variant="outline"
        size="touch"
        className="w-full justify-start"
        onClick={async () => {
          if (await appInstallieren()) toast.success("App wird installiert");
        }}
      >
        <DownloadIcon />
        App auf dem Handy installieren
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">App auf den Startbildschirm legen</p>
      <p className="mt-1">
        In Chrome oben rechts auf <span className="font-semibold">⋮</span> tippen
        und dann „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.
      </p>
    </div>
  );
}
