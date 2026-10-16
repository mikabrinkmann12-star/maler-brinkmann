"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, CheckIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { anweisungArchivieren, anweisungFreigeben, anweisungSpeichern } from "@/app/buero/angebote/anweisung-actions";

/** Büro/Admin: Text der Arbeitsanweisung prüfen und ändern, für Mitarbeiter freigeben oder archivieren. */
export function AnweisungBearbeiten({ id, titel, inhalt, freigegeben }: { id: string; titel: string; inhalt: string; freigegeben: boolean }) {
  const router = useRouter();
  const [t, setT] = useState(titel);
  const [text, setText] = useState(inhalt);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frageArchiv, setFrageArchiv] = useState(false);
  const [laeuft, starte] = useTransition();
  const geaendert = t !== titel || text !== inhalt;

  function ausfuehren(f: () => Promise<{ fehler?: string }>, ok: string) {
    setFehler(null);
    starte(async () => {
      const r = await f();
      if (r.fehler) return setFehler(r.fehler);
      toast.success(ok);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        Titel
        <Input value={t} maxLength={200} onChange={(e) => { setT(e.target.value); setFehler(null); }} className="h-11 text-base" />
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted-foreground">
        Text (Zeilen mit „# “ sind Überschriften, mit „- “ Stichpunkte, mit zwei Leerzeichen und „- “ Unterpunkte)
        <Textarea value={text} rows={14} maxLength={20000} onChange={(e) => { setText(e.target.value); setFehler(null); }} className="font-mono text-sm" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => ausfuehren(() => anweisungSpeichern(id, t, text), "Gespeichert")} disabled={laeuft || !geaendert}>
          <CheckIcon /> Speichern
        </Button>
        {freigegeben ? (
          <Button type="button" variant="outline" disabled={laeuft || geaendert} onClick={() => ausfuehren(() => anweisungFreigeben(id, false), "Freigabe zurückgenommen")}>
            <EyeOffIcon /> Freigabe zurücknehmen
          </Button>
        ) : (
          <Button type="button" variant="secondary" disabled={laeuft || geaendert} onClick={() => ausfuehren(() => anweisungFreigeben(id, true), "Für Mitarbeiter freigegeben")}>
            <EyeIcon /> Für Mitarbeiter freigeben
          </Button>
        )}
        {frageArchiv ? (
          <>
            <Button type="button" variant="destructive" disabled={laeuft} onClick={() => ausfuehren(() => anweisungArchivieren(id), "Archiviert")}>Wirklich archivieren</Button>
            <Button type="button" variant="ghost" onClick={() => setFrageArchiv(false)}>Abbrechen</Button>
          </>
        ) : (
          <Button type="button" variant="ghost" disabled={laeuft} onClick={() => setFrageArchiv(true)}><ArchiveIcon /> Archivieren</Button>
        )}
      </div>
      {geaendert && <p className="text-sm text-muted-foreground">Speichere zuerst, danach kannst du freigeben.</p>}
    </div>
  );
}
