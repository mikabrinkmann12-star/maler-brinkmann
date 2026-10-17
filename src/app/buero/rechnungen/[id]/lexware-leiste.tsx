"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, DownloadIcon, EyeIcon, ExternalLinkIcon, RefreshCwIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button, buttonVariants } from "@/components/ui/button";
import type { RechnungStatus } from "@/lib/rechnung";
import { rechnungAbgleichen, rechnungArchivieren, rechnungUebertragen, rechnungWiederFreigeben } from "../actions";

/** Übertragung an Lexware, Abgleich, PDF und Link. Das Finalisieren in Lexware ist nicht rücknehmbar, deshalb mit Bestätigung. */
export function LexwareLeiste({
  rechnungId,
  status,
  lexwareLink,
  hatPdf,
  eingerichtet,
  finalisieren,
  festgehangen,
}: {
  rechnungId: string;
  status: RechnungStatus;
  lexwareLink: string | null;
  hatPdf: boolean;
  eingerichtet: boolean;
  /** true = Lexware finalisiert sofort, false = nur Entwurf (Test-Modus) */
  finalisieren: boolean;
  /** Steht seit über fünf Minuten auf „wird übertragen“ */
  festgehangen: boolean;
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
          {!eingerichtet && (
            <FormularMeldung art="hinweis">Lexware ist noch nicht eingerichtet: Der Admin trägt den API-Schlüssel (LEXWARE_API_KEY) in Vercel ein. Bis dahin kann die Rechnung vorbereitet, aber nicht gesendet werden.</FormularMeldung>
          )}
          {frage ? (
            <>
              <p className="text-sm">
                {finalisieren
                  ? "Lexware erzeugt jetzt die fertige Rechnung mit Rechnungsnummer. Das lässt sich nicht mehr rückgängig machen, danach ist die Rechnung gesperrt. Prüfe vorher Betrag, Kunde und Leistungszeitraum."
                  : "Test-Modus: Lexware legt die Rechnung nur als Entwurf an. Es entsteht keine Rechnungsnummer."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => ausfuehren(() => rechnungUebertragen(rechnungId), "An Lexware übertragen")} disabled={laeuft || !eingerichtet}>
                  <SendIcon /> {laeuft ? "Wird übertragen …" : finalisieren ? "Ja, jetzt an Lexware senden" : "Ja, als Entwurf an Lexware senden"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setFrage(false)} disabled={laeuft}>Abbrechen</Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setFrage(true)} disabled={!eingerichtet}><SendIcon /> An Lexware senden</Button>
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

      {status === "wird_uebertragen" && (
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <p className="text-sm">Die Rechnung wird gerade an Lexware übertragen. Lade die Seite gleich neu.</p>
          {festgehangen && (
            <div>
              <Button type="button" variant="outline" disabled={laeuft} onClick={() => ausfuehren(() => rechnungWiederFreigeben(rechnungId), "Wieder freigegeben")}>Hängt die Übertragung? Wieder freigeben</Button>
            </div>
          )}
        </div>
      )}

      {status === "uebertragen" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => ausfuehren(() => rechnungAbgleichen(rechnungId), "Mit Lexware abgeglichen")} disabled={laeuft || !eingerichtet}>
            <RefreshCwIcon /> {laeuft ? "Gleicht ab …" : "Aus Lexware abgleichen"}
          </Button>
          {hatPdf && (
            <>
              <a href={`/buero/rechnungen/${rechnungId}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><EyeIcon /> Datei ansehen</a>
              <a href={`/buero/rechnungen/${rechnungId}/pdf?download=1`} className={buttonVariants({ variant: "outline" })}><DownloadIcon /> Datei herunterladen</a>
            </>
          )}
          {lexwareLink && (
            <a href={lexwareLink} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}><ExternalLinkIcon /> In Lexware öffnen</a>
          )}
        </div>
      )}
    </div>
  );
}
