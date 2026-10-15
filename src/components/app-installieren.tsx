"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle2Icon, DownloadIcon, ShareIcon } from "lucide-react";
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

function nichtAbonnieren() {
  return () => {};
}

/** iPhone/iPad (iPadOS meldet sich als Mac, hat aber Touch). */
function istApple(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Bereich „App installieren“ für die Seite „Mehr“. */
export function AppInstallieren() {
  const apple = useSyncExternalStore(nichtAbonnieren, istApple, () => false);
  const angebot = useSyncExternalStore(
    installAngebotAbonnieren,
    installAngebotVorhanden,
    () => false,
  );
  const installiert = useSyncExternalStore(
    standaloneAbonnieren,
    () =>
      window.matchMedia(STANDALONE).matches ||
      // ältere iPhones melden die Home-Bildschirm-App nur so
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
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

  if (apple) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">App auf den Home-Bildschirm legen</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Diese Seite in <span className="font-semibold">Safari</span> öffnen.</li>
          <li>
            Unten auf <ShareIcon className="inline size-4 align-text-bottom" aria-label="Teilen" />{" "}
            (Teilen) tippen.
          </li>
          <li>„Zum Home-Bildschirm“ wählen und „Hinzufügen“ tippen.</li>
        </ol>
      </div>
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
