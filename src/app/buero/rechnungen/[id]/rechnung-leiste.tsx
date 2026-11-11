"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, DownloadIcon, EyeIcon, RefreshCwIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button, buttonVariants } from "@/components/ui/button";
import type { RechnungStatus } from "@/lib/rechnung";
import { rechnungArchivieren, rechnungFertigstellen, rechnungPdfNeuErzeugen } from "../actions";

/** Fertigstellen (mit Bestätigung, nicht rücknehmbar), Entwurf archivieren, PDF nachholen und Datei ansehen bzw. herunterladen. */
export function RechnungLeiste({
  rechnungId,
  status,
  eigen,
  artName = "Rechnung",
  hatPdf,
}: {
  rechnungId: string;
  status: RechnungStatus;
  /** Rechnung der App (nur dann lässt sich ein fehlendes PDF nachholen; ältere Rechnungen sind unveränderlich) */
  eigen: boolean;
  /** Name der Rechnungsart für die Knöpfe („Rechnung“, „Schlussrechnung“, „Gutschrift“ …) */
  artName?: string;
  hatPdf: boolean;
}) {
  const router = useRouter();
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [frage, setFrage] = useState(false);
  const [frageArchiv, setFrageArchiv] = useState(false);
  const [laeuft, starte] = useTransition();

  function ausfuehren(f: () => Promise<{ fehler?: string; hinweis?: string }>, ok: string) {
    setFehler(null);
    setHinweis(null);
    starte(async () => {
      const r = await f();
      setFrage(false);
      if (r.fehler) {
        setFehler(r.fehler);
        router.refresh();
        return;
      }
      if (r.hinweis) setHinweis(r.hinweis);
      toast.success(ok);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {hinweis && <FormularMeldung art="hinweis">{hinweis}</FormularMeldung>}

      {status === "entwurf" && (
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          {frage ? (
            <>
              <p className="text-sm">
                {artName === "Rechnung" ? "Die Rechnung" : "Das Dokument"} bekommt jetzt seine Nummer und wird als PDF festgeschrieben. Das lässt sich nicht mehr rückgängig machen, danach ist die Rechnung gesperrt.
                Prüfe vorher Betrag, Kunde, Rechnungsdatum und Leistungszeitraum.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => ausfuehren(() => rechnungFertigstellen(rechnungId), "Rechnung fertiggestellt")} disabled={laeuft}>
                  <SendIcon /> {laeuft ? "Wird erstellt …" : `Ja, ${artName} jetzt fertigstellen`}
                </Button>
                <a href={`/buero/rechnungen/${rechnungId}/vorschau`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><EyeIcon /> Vorher als PDF ansehen</a>
                <Button type="button" variant="ghost" onClick={() => setFrage(false)} disabled={laeuft}>Abbrechen</Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setFrage(true)}><SendIcon /> {artName} fertigstellen</Button>
              <a href={`/buero/rechnungen/${rechnungId}/vorschau`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><EyeIcon /> PDF-Vorschau</a>
              {frageArchiv ? (
                <>
                  <Button type="button" variant="destructive" disabled={laeuft} onClick={() => ausfuehren(() => rechnungArchivieren(rechnungId), "Entwurf archiviert")}>Wirklich archivieren</Button>
                  <Button type="button" variant="ghost" onClick={() => setFrageArchiv(false)}>Abbrechen</Button>
                </>
              ) : (
                <Button type="button" variant="ghost" onClick={() => setFrageArchiv(true)}><ArchiveIcon /> Entwurf archivieren</Button>
              )}
            </div>
          )}
        </div>
      )}

      {status === "uebertragen" && (
        <div className="flex flex-wrap gap-2">
          {eigen && !hatPdf && (
            <Button type="button" variant="outline" onClick={() => ausfuehren(() => rechnungPdfNeuErzeugen(rechnungId), "PDF erzeugt")} disabled={laeuft}>
              <RefreshCwIcon /> {laeuft ? "Erzeugt …" : "PDF neu erzeugen"}
            </Button>
          )}
          {hatPdf && (
            <>
              <a href={`/buero/rechnungen/${rechnungId}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><EyeIcon /> Datei ansehen</a>
              <a href={`/buero/rechnungen/${rechnungId}/pdf?download=1`} className={buttonVariants({ variant: "outline" })}><DownloadIcon /> Datei herunterladen</a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
