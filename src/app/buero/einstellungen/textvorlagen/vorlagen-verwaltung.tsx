"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, CheckIcon, PencilIcon, PlusIcon, StarIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TEXTVORLAGE_ART_NAMEN, vorlagenDerArt, type Textvorlage, type TextvorlageArt } from "@/lib/textvorlagen";
import { vorlageArchivieren, vorlageSpeichern } from "./actions";

function VorlageFormular({
  art,
  vorlage,
  onFertig,
}: {
  art: TextvorlageArt;
  vorlage: Textvorlage | null;
  onFertig: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(vorlage?.name ?? "");
  const [inhalt, setInhalt] = useState(vorlage?.inhalt ?? "");
  const [standard, setStandard] = useState(vorlage?.standard ?? false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    starte(async () => {
      const r = await vorlageSpeichern(vorlage?.id ?? null, { art, name, inhalt, standard });
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Vorlage gespeichert");
      onFertig();
      router.refresh();
    });
  }

  return (
    <form onSubmit={speichern} className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <Feld label="Name der Vorlage" htmlFor={`name-${vorlage?.id ?? art}`} hinweis="So heißt sie in der Auswahl im Angebot, z. B. „Privatkunde“ oder „Gewerbe“.">
        <Input id={`name-${vorlage?.id ?? art}`} value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setFehler(null); }} className="h-11 text-base" />
      </Feld>
      <Feld label={TEXTVORLAGE_ART_NAMEN[art]} htmlFor={`inhalt-${vorlage?.id ?? art}`}>
        <Textarea id={`inhalt-${vorlage?.id ?? art}`} value={inhalt} rows={6} maxLength={3000} onChange={(e) => { setInhalt(e.target.value); setFehler(null); }} />
      </Feld>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={standard} onChange={(e) => setStandard(e.target.checked)} className="size-4 accent-primary" />
        Als Standard für neue Angebote verwenden
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={laeuft}><CheckIcon /> {laeuft ? "Speichern …" : "Speichern"}</Button>
        <Button type="button" variant="ghost" onClick={onFertig} disabled={laeuft}><XIcon /> Abbrechen</Button>
      </div>
    </form>
  );
}

function VorlagenZeile({ vorlage }: { vorlage: Textvorlage }) {
  const router = useRouter();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [frage, setFrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  if (bearbeiten) return <VorlageFormular art={vorlage.art} vorlage={vorlage} onFertig={() => setBearbeiten(false)} />;

  function archivieren() {
    setFehler(null);
    starte(async () => {
      const r = await vorlageArchivieren(vorlage.id);
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Vorlage archiviert");
      router.refresh();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{vorlage.name}</h3>
        {vorlage.standard && <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"><StarIcon className="size-3" /> Standard</span>}
        <span className="ml-auto flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setBearbeiten(true)}><PencilIcon /> Bearbeiten</Button>
          {frage ? (
            <>
              <Button type="button" variant="destructive" size="sm" disabled={laeuft} onClick={archivieren}>Wirklich archivieren</Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Abbrechen" onClick={() => setFrage(false)}><XIcon /></Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setFrage(true)}><ArchiveIcon /> Archivieren</Button>
          )}
        </span>
      </div>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <p className="line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">{vorlage.inhalt}</p>
    </li>
  );
}

/** Textvorlagen für Anfangs- und Schlusstext verwalten (nur Admin). */
export function VorlagenVerwaltung({ vorlagen }: { vorlagen: Textvorlage[] }) {
  const [neu, setNeu] = useState<TextvorlageArt | null>(null);
  return (
    <div className="flex flex-col gap-8">
      {(["einleitung", "schlusstext"] as const).map((art) => {
        const liste = vorlagenDerArt(vorlagen, art);
        return (
          <section key={art} aria-labelledby={`titel-${art}`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`titel-${art}`} className="text-lg font-semibold">{TEXTVORLAGE_ART_NAMEN[art]}-Vorlagen</h2>
              {neu !== art && <Button type="button" variant="outline" size="sm" onClick={() => setNeu(art)}><PlusIcon /> Neue Vorlage</Button>}
            </div>
            {neu === art && <VorlageFormular art={art} vorlage={null} onFertig={() => setNeu(null)} />}
            {liste.length === 0 && neu !== art ? (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                Noch keine Vorlage. Neue Angebote nehmen den Text aus „Angebote – Vorgaben“.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">{liste.map((v) => <VorlagenZeile key={`${v.id}:${v.name}|${v.inhalt}|${v.standard}`} vorlage={v} />)}</ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
