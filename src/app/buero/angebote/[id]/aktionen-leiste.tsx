"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, ClipboardListIcon, CopyIcon, DownloadIcon, EyeIcon, ReceiptTextIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button, buttonVariants } from "@/components/ui/button";
import { STATUS_NAMEN, type AngebotStatus } from "@/lib/angebot";
import { angebotArchivieren, angebotKopieren, angebotStatusSetzen } from "../actions";
import { arbeitsanweisungErstellen } from "../anweisung-actions";
import { rechnungAusAngebotErstellen } from "../../rechnungen/actions";

const WEITER: Record<AngebotStatus, AngebotStatus[]> = {
  entwurf: ["versendet"],
  versendet: ["angenommen", "abgelehnt", "entwurf"],
  angenommen: ["abgelehnt", "versendet", "entwurf"],
  abgelehnt: ["angenommen", "versendet", "entwurf"],
};

/** PDF, Status wechseln, Kopieren, Archivieren. */
export function AktionenLeiste({ angebotId, status, archiviert }: { angebotId: string; status: AngebotStatus; archiviert: boolean }) {
  const router = useRouter();
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState<AngebotStatus | null>(null);
  const [laeuft, starte] = useTransition();

  function setzen(neu: AngebotStatus) {
    setFehler(null);
    starte(async () => {
      const r = await angebotStatusSetzen(angebotId, neu);
      if (r.fehler) return setFehler(r.fehler);
      setFrage(null);
      toast.success(`Status: ${STATUS_NAMEN[neu]}`);
      router.refresh();
    });
  }

  function kopieren() {
    setFehler(null);
    starte(async () => {
      const r = await angebotKopieren(angebotId);
      if (r.fehler && !r.id) return setFehler(r.fehler);
      if (r.fehler) toast.warning(r.fehler);
      else toast.success("Kopie angelegt");
      router.push(`/buero/angebote/${r.id}`);
    });
  }

  function anweisung() {
    setFehler(null);
    starte(async () => {
      const r = await arbeitsanweisungErstellen(angebotId);
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Arbeitsanweisung erzeugt: bitte prüfen und freigeben");
      router.push(`/baustellen/${r.projektId}#arbeitsanweisung`);
    });
  }

  function rechnung() {
    setFehler(null);
    starte(async () => {
      const r = await rechnungAusAngebotErstellen(angebotId);
      if (r.fehler || !r.id) return setFehler(r.fehler ?? "Das hat nicht geklappt.");
      toast.success(r.hinweis ?? "Rechnungsentwurf erstellt: bitte prüfen");
      router.push(`/buero/rechnungen/${r.id}`);
    });
  }

  function archivieren() {
    setFehler(null);
    starte(async () => {
      const r = await angebotArchivieren(angebotId, !archiviert);
      if (r.fehler) return setFehler(r.fehler);
      toast.success(archiviert ? "Angebot wiederhergestellt" : "Angebot archiviert");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <div className="flex flex-wrap gap-2">
        <a href={`/buero/angebote/${angebotId}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
          <EyeIcon /> PDF ansehen
        </a>
        <a href={`/buero/angebote/${angebotId}/pdf?download=1`} className={buttonVariants({ variant: "outline" })}>
          <DownloadIcon /> PDF herunterladen
        </a>
        <Button type="button" variant="outline" onClick={kopieren} disabled={laeuft}><CopyIcon /> Kopieren</Button>
        {(status === "versendet" || status === "angenommen") && (
          <Button type="button" variant="outline" onClick={rechnung} disabled={laeuft}><ReceiptTextIcon /> Rechnung erstellen</Button>
        )}
        <Button type="button" variant="outline" onClick={anweisung} disabled={laeuft}><ClipboardListIcon /> Arbeitsanweisung erstellen</Button>
        <Button type="button" variant="outline" onClick={archivieren} disabled={laeuft}>
          {archiviert ? <ArchiveRestoreIcon /> : <ArchiveIcon />} {archiviert ? "Wiederherstellen" : "Archivieren"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Status ändern:</span>
        {WEITER[status].map((s) =>
          s === "versendet" && status === "entwurf" ? (
            frage === "versendet" ? (
              <span key={s} className="flex items-center gap-2">
                <Button type="button" onClick={() => setzen("versendet")} disabled={laeuft}><SendIcon /> Ja, als versendet markieren</Button>
                <Button type="button" variant="ghost" onClick={() => setFrage(null)}>Abbrechen</Button>
              </span>
            ) : (
              <Button key={s} type="button" onClick={() => setFrage("versendet")} disabled={laeuft}><SendIcon /> Als versendet markieren</Button>
            )
          ) : (
            <Button key={s} type="button" variant={s === "entwurf" ? "ghost" : "secondary"} onClick={() => setzen(s)} disabled={laeuft}>
              {s === "entwurf" ? "Zurück auf Entwurf" : s === "versendet" ? "Zurück auf Versendet" : STATUS_NAMEN[s]}
            </Button>
          ),
        )}
      </div>
      {frage === "versendet" && (
        <p className="text-sm text-muted-foreground">Danach ist das Angebot gesperrt. Zum Ändern setzt du es wieder auf Entwurf zurück. Das Versenden selbst (E-Mail) geschieht noch außerhalb der App: lade das PDF herunter.</p>
      )}
    </div>
  );
}
