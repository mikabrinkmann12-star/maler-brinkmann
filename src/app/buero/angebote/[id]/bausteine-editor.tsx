"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, ChevronRightIcon, CopyPlusIcon, ImageIcon, LibraryIcon, PlusIcon, SigmaIcon, TextIcon, HeadingIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import type { BerechneteZeile, BausteinTyp } from "@/lib/angebot";
import { fotoVorbereiten } from "@/lib/bild";
import { neueId } from "@/lib/warteschlange";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { bausteinSpeichern, bildBausteinAnlegen } from "../actions";
import { BausteinKarte } from "./baustein-karte";
import { DokumentAuswahl } from "./dokument-auswahl";
import { KatalogAuswahl } from "./katalog-auswahl";

type Modus = { art: "neu"; typ: BausteinTyp } | { art: "katalog" } | { art: "dokument" } | null;

function HinzufuegenLeiste({ angebotId, projektId, nachId, onAbbrechen }: { angebotId: string; projektId: string; nachId: string | null; onAbbrechen?: () => void }) {
  const router = useRouter();
  const [modus, setModus] = useState<Modus>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const dateiRef = useRef<HTMLInputElement>(null);

  function zwischensumme() {
    setFehler(null);
    starte(async () => {
      const r = await bausteinSpeichern(angebotId, null, { typ: "zwischensumme" }, nachId);
      if (r.fehler) return setFehler(r.fehler);
      router.refresh();
    });
  }

  function bildWaehlen(datei: File | undefined) {
    if (!datei) return;
    setFehler(null);
    starte(async () => {
      try {
        if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(datei.type)) return setFehler("Bitte ein Bild wählen (JPEG oder PNG).");
        const { bild } = await fotoVorbereiten(datei);
        const pfad = `${angebotId}/${neueId()}.jpg`;
        const { error } = await createBrowserSupabase().storage.from("angebotsbilder").upload(pfad, bild, { contentType: "image/jpeg", upsert: false });
        if (error) return setFehler("Das Bild konnte nicht hochgeladen werden. Bitte nochmal versuchen.");
        const r = await bildBausteinAnlegen(angebotId, pfad, "", nachId);
        if (r.fehler) return setFehler(r.fehler);
        toast.success("Bild hinzugefügt");
        router.refresh();
      } catch {
        setFehler("Das Bild konnte nicht verarbeitet werden.");
      } finally {
        if (dateiRef.current) dateiRef.current.value = "";
      }
    });
  }

  if (modus?.art === "katalog") return <KatalogAuswahl angebotId={angebotId} nachId={nachId} onSchliessen={() => { setModus(null); onAbbrechen?.(); }} />;
  if (modus?.art === "dokument") return <DokumentAuswahl angebotId={angebotId} nachId={nachId} onSchliessen={() => { setModus(null); onAbbrechen?.(); }} />;
  if (modus?.art === "neu") {
    return (
      <BausteinKarte angebotId={angebotId} projektId={projektId} baustein={null} neuTyp={modus.typ} nachId={nachId} nummer="neu" zwischensumme={null}
        gesperrt={false} erste={false} letzte={false} onFertig={() => { setModus(null); onAbbrechen?.(); }} />
    );
  }

  const knopf = (symbol: React.ReactNode, text: string, aktion: () => void) => (
    <Button type="button" variant="outline" size="sm" disabled={laeuft} onClick={aktion}>{symbol} {text}</Button>
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed p-3">
      {nachId && (
        <p className="flex items-center justify-between text-sm text-muted-foreground">
          Hier einfügen
          <Button type="button" variant="ghost" size="icon" aria-label="Abbrechen" onClick={onAbbrechen}><XIcon /></Button>
        </p>
      )}
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      <div className="flex flex-wrap gap-2">
        {knopf(<PlusIcon />, "Position", () => setModus({ art: "neu", typ: "position" }))}
        {knopf(<LibraryIcon />, "Aus Katalog", () => setModus({ art: "katalog" }))}
        {knopf(<CopyPlusIcon />, "Aus Dokument", () => setModus({ art: "dokument" }))}
        {knopf(<HeadingIcon />, "Titel", () => setModus({ art: "neu", typ: "titel" }))}
        {knopf(<TextIcon />, "Text", () => setModus({ art: "neu", typ: "text" }))}
        {knopf(<SigmaIcon />, "Zwischensumme", zwischensumme)}
        <Button type="button" variant="outline" size="sm" disabled={laeuft} onClick={() => dateiRef.current?.click()}>
          <ImageIcon /> {laeuft ? "Lädt …" : "Bild"}
        </Button>
        <input ref={dateiRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(e) => bildWaehlen(e.target.files?.[0])} />
      </div>
    </div>
  );
}

/** Liste der Bausteine mit Hinzufügen-Leiste am Ende und optional mitten im Angebot. */
export function BausteineEditor({
  angebotId,
  projektId,
  zeilen,
  bildUrls,
  gesperrt,
}: {
  angebotId: string;
  projektId: string;
  zeilen: BerechneteZeile[];
  bildUrls: Record<string, string>;
  gesperrt: boolean;
}) {
  const [einfuegenNach, setEinfuegenNach] = useState<string | null>(null);
  // Eingeklappte Titel: ihre Positionen bis zum nächsten Titel sind ausgeblendet (nur Anzeige, nichts wird geändert)
  const [eingeklappt, setEingeklappt] = useState<Set<string>>(new Set());
  const umschalten = (id: string) => setEingeklappt((alt) => { const neu = new Set(alt); if (!neu.delete(id)) neu.add(id); return neu; });
  const versteckt = new Set<string>();
  const anzahlUnter = new Map<string, number>();
  let aktuellerTitel: string | null = null;
  for (const z of zeilen) {
    if (z.baustein.typ === "titel") { aktuellerTitel = z.baustein.id; anzahlUnter.set(aktuellerTitel, 0); continue; }
    if (aktuellerTitel) {
      anzahlUnter.set(aktuellerTitel, (anzahlUnter.get(aktuellerTitel) ?? 0) + 1);
      if (eingeklappt.has(aktuellerTitel)) versteckt.add(z.baustein.id);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {zeilen.length === 0 && <p className="rounded-xl border border-dashed p-6 text-muted-foreground">Noch keine Bausteine. Füge unten eine Position hinzu oder nimm sie aus dem Katalog.</p>}
      {zeilen.map((z, i) => versteckt.has(z.baustein.id) ? null : (
        <div key={`${z.baustein.id}:${z.baustein.kurztext}|${z.baustein.langtext}|${z.baustein.menge}|${z.baustein.einheit}|${z.baustein.einzelpreis}`} className="flex flex-col gap-2">
          {z.baustein.typ === "titel" && (anzahlUnter.get(z.baustein.id) ?? 0) > 0 && (
            <button type="button" onClick={() => umschalten(z.baustein.id)} aria-expanded={!eingeklappt.has(z.baustein.id)}
              className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {eingeklappt.has(z.baustein.id) ? <ChevronRightIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
              {eingeklappt.has(z.baustein.id) ? `Ausklappen (${anzahlUnter.get(z.baustein.id)} ausgeblendet)` : "Einklappen"}
            </button>
          )}
          <BausteinKarte angebotId={angebotId} projektId={projektId} baustein={z.baustein} nummer={z.nummer} zwischensumme={z.zwischensumme}
            bildUrl={bildUrls[z.baustein.id]} gesperrt={gesperrt} erste={i === 0} letzte={i === zeilen.length - 1} />
          {!gesperrt && i < zeilen.length - 1 && (
            einfuegenNach === z.baustein.id ? (
              <HinzufuegenLeiste angebotId={angebotId} projektId={projektId} nachId={z.baustein.id} onAbbrechen={() => setEinfuegenNach(null)} />
            ) : (
              <button type="button" onClick={() => setEinfuegenNach(z.baustein.id)}
                className="mx-auto -my-1 flex h-6 items-center gap-1 rounded-full px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                <PlusIcon className="size-3" /> hier einfügen
              </button>
            )
          )}
        </div>
      ))}
      {!gesperrt && <HinzufuegenLeiste angebotId={angebotId} projektId={projektId} nachId={null} />}
    </div>
  );
}
