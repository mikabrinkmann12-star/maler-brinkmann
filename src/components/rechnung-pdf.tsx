"use client";

import { useEffect, useRef, useState } from "react";
import { DownloadIcon, MaximizeIcon, PrinterIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Adresse der Rechnungsdatei (die Kopie, die die Buchhaltung erzeugt hat; Route Handler mit eigener Rollenprüfung). */
const dateiAdresse = (id: string, herunterladen = false) => `/buero/rechnungen/${id}/pdf${herunterladen ? "?download=1" : ""}`;
/** Im eingebetteten Rahmen ohne Seitenleiste mit Vorschaubildern (zu unruhig, die Rechnung steht im Vordergrund) */
const rahmenAdresse = (id: string) => `${dateiAdresse(id)}#navpanes=0`;

/**
 * Vollbild-Fenster über der aktuellen Seite wie in Plancraft: Titel, Drucken, Herunterladen, Schließen, darunter die eingebettete Rechnung.
 * Die Datei kommt von der Buchhaltung (Lexware/sevdesk), die App zeigt sie nur an.
 */
export function RechnungPdfFenster({ rechnungId, titel, onClose, autoDrucken = false }: { rechnungId: string; titel: string; onClose: () => void; autoDrucken?: boolean }) {
  const rahmen = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", taste);
    return () => {
      document.body.style.overflow = vorher;
      window.removeEventListener("keydown", taste);
    };
  }, [onClose]);

  function drucken() {
    // Gleiche Adresse wie die Seite, darum darf die App im Rahmen drucken; sonst Rückfall auf ein neues Fenster
    try {
      rahmen.current?.contentWindow?.focus();
      rahmen.current?.contentWindow?.print();
    } catch {
      window.open(dateiAdresse(rechnungId), "_blank", "noopener");
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={titel} className="fixed inset-0 z-50 flex flex-col bg-neutral-800">
      <div className="flex items-center gap-2 bg-neutral-900 px-3 py-2 text-white">
        <button type="button" onClick={onClose} aria-label="Schließen" title="Schließen (Esc)" className="flex size-9 items-center justify-center rounded-md hover:bg-white/10">
          <XIcon className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium">{titel}</p>
        <button type="button" onClick={drucken} aria-label="Drucken" title="Drucken" className="flex size-9 items-center justify-center rounded-md hover:bg-white/10">
          <PrinterIcon className="size-5" />
        </button>
        <a href={dateiAdresse(rechnungId, true)} aria-label="Herunterladen" title="Herunterladen" className="flex size-9 items-center justify-center rounded-md hover:bg-white/10">
          <DownloadIcon className="size-5" />
        </a>
      </div>
      <iframe
        ref={rahmen}
        src={rahmenAdresse(rechnungId)}
        title={titel}
        // Aus dem Menü „Drucken“: nach dem Laden den Druckdialog öffnen (kurz warten, bis das PDF gezeichnet ist)
        onLoad={autoDrucken ? () => window.setTimeout(drucken, 600) : undefined}
        className="w-full flex-1 border-0 bg-neutral-700"
      />
    </div>
  );
}

/**
 * Eingebettete Ansicht der Rechnung auf der Rechnungsseite (immer sichtbar, ohne Herunterladen) mit Knopf für das Vollbild-Fenster.
 * `version` ändert sich nach jedem Abgleich, damit die neue Datei geladen wird.
 */
export function RechnungPdfAnsicht({ rechnungId, titel, version }: { rechnungId: string; titel: string; version: string }) {
  const [offen, setOffen] = useState(false);
  return (
    <section aria-label="Rechnung als PDF" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Rechnung</h2>
        <Button type="button" variant="outline" onClick={() => setOffen(true)}>
          <MaximizeIcon /> Vollbild
        </Button>
      </div>
      <iframe key={version} src={rahmenAdresse(rechnungId)} title={titel} className="h-[75vh] w-full rounded-lg border bg-neutral-100" />
      {offen && <RechnungPdfFenster rechnungId={rechnungId} titel={titel} onClose={() => setOffen(false)} />}
    </section>
  );
}
