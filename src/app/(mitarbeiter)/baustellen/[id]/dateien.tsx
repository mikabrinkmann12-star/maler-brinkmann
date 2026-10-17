"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlusIcon, FileTextIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { DATEI_ACCEPT, dateiPfad, dateiPruefen } from "@/lib/dateien";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { neueId } from "@/lib/warteschlange";
import { dateiArchivieren, dateiSpeichern } from "../datei-actions";

export type DateiAnzeige = {
  id: string;
  dateiname: string;
  groesse: string;
  wer: string;
  wann: string;
  url: string | null;
  darfLoeschen: boolean;
};

const MAX_AUF_EINMAL = 5;

/** Dateien der Ablage: hinzufügen (Datei wählen), ansehen/herunterladen, eigene entfernen. */
export function Dateien({
  projektId,
  darfHochladen,
  dateien,
}: {
  projektId: string;
  darfHochladen: boolean;
  dateien: DateiAnzeige[];
}) {
  const router = useRouter();
  const wahlRef = useRef<HTMLInputElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function waehlen(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    const dateienListe = [...liste].slice(0, MAX_AUF_EINMAL);
    setFehler(liste.length > MAX_AUF_EINMAL ? `Es werden nur die ersten ${MAX_AUF_EINMAL} Dateien hochgeladen.` : null);
    starte(async () => {
      const speicher = createBrowserSupabase().storage.from("projektdateien");
      let geschafft = 0;
      for (const datei of dateienListe) {
        const art = dateiPruefen(datei.name, datei.size);
        if (!art.ok) {
          setFehler(art.fehler);
          continue;
        }
        const id = neueId();
        const { error } = await speicher.upload(dateiPfad(projektId, id, art.endung), datei, { contentType: art.typ, upsert: false });
        if (error) {
          setFehler(`„${datei.name}“ konnte nicht hochgeladen werden. Bitte nochmal versuchen (Netz prüfen).`);
          continue;
        }
        const r = await dateiSpeichern({ id, projektId, dateiname: datei.name, groesseBytes: datei.size });
        if (r.fehler) {
          setFehler(r.fehler);
          continue;
        }
        geschafft += 1;
      }
      if (wahlRef.current) wahlRef.current.value = "";
      if (geschafft > 0) {
        toast.success(geschafft === 1 ? "Datei hinzugefügt" : `${geschafft} Dateien hinzugefügt`);
        router.refresh();
      }
    });
  }

  function entfernen(id: string) {
    setFehler(null);
    starte(async () => {
      const r = await dateiArchivieren(id, projektId);
      if (r.fehler) return setFehler(r.fehler);
      setFrage(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">Dateien ({dateien.length})</h3>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {darfHochladen && (
        <div>
          <Button type="button" size="touch" variant="outline" disabled={laeuft} onClick={() => wahlRef.current?.click()}>
            <FilePlusIcon /> {laeuft ? "Lädt hoch …" : "Datei hinzufügen"}
          </Button>
          <input ref={wahlRef} type="file" multiple accept={DATEI_ACCEPT} className="hidden" onChange={(e) => waehlen(e.target.files)} />
          <p className="mt-1 text-sm text-muted-foreground">PDF, Word, Excel, PowerPoint, Text, CSV oder ZIP, bis 20 MB.</p>
        </div>
      )}
      {dateien.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Dateien.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {dateien.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">{d.dateiname}</a>
                ) : (
                  <span className="block truncate font-medium">{d.dateiname}</span>
                )}
                <span className="text-sm text-muted-foreground">{d.groesse} · {d.wer} · {d.wann}</span>
              </div>
              {d.darfLoeschen && (frage === d.id ? (
                <span className="flex items-center gap-1">
                  <Button type="button" variant="destructive" size="sm" disabled={laeuft} onClick={() => entfernen(d.id)}>Entfernen</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFrage(null)}>Abbrechen</Button>
                </span>
              ) : (
                <Button type="button" variant="ghost" size="icon" aria-label="Datei entfernen" onClick={() => setFrage(d.id)}><Trash2Icon /></Button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
