"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, LibraryIcon, PlusIcon, SigmaIcon, TextIcon, HeadingIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import type { BerechneteZeile, BausteinTyp } from "@/lib/angebot";
import { fotoVorbereiten } from "@/lib/bild";
import { neueId } from "@/lib/warteschlange";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { bausteinSpeichern, bildBausteinAnlegen } from "../actions";
import { BausteinKarte } from "./baustein-karte";
import { KatalogAuswahl } from "./katalog-auswahl";

type Modus = { art: "neu"; typ: BausteinTyp } | { art: "katalog" } | null;

function HinzufuegenLeiste({ angebotId, nachId, onAbbrechen }: { angebotId: string; nachId: string | null; onAbbrechen?: () => void }) {
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
  if (modus?.art === "neu") {
    return (
      <BausteinKarte angebotId={angebotId} baustein={null} neuTyp={modus.typ} nachId={nachId} nummer="neu" zwischensumme={null}
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
  zeilen,
  bildUrls,
  gesperrt,
}: {
  angebotId: string;
  zeilen: BerechneteZeile[];
  bildUrls: Record<string, string>;
  gesperrt: boolean;
}) {
  const [einfuegenNach, setEinfuegenNach] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {zeilen.length === 0 && <p className="rounded-xl border border-dashed p-6 text-muted-foreground">Noch keine Bausteine. Füge unten eine Position hinzu oder nimm sie aus dem Katalog.</p>}
      {zeilen.map((z, i) => (
        <div key={`${z.baustein.id}:${z.baustein.kurztext}|${z.baustein.langtext}|${z.baustein.menge}|${z.baustein.einheit}|${z.baustein.einzelpreis}`} className="flex flex-col gap-2">
          <BausteinKarte angebotId={angebotId} baustein={z.baustein} nummer={z.nummer} zwischensumme={z.zwischensumme}
            bildUrl={bildUrls[z.baustein.id]} gesperrt={gesperrt} erste={i === 0} letzte={i === zeilen.length - 1} />
          {!gesperrt && i < zeilen.length - 1 && (
            einfuegenNach === z.baustein.id ? (
              <HinzufuegenLeiste angebotId={angebotId} nachId={z.baustein.id} onAbbrechen={() => setEinfuegenNach(null)} />
            ) : (
              <button type="button" onClick={() => setEinfuegenNach(z.baustein.id)}
                className="mx-auto -my-1 flex h-6 items-center gap-1 rounded-full px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                <PlusIcon className="size-3" /> hier einfügen
              </button>
            )
          )}
        </div>
      ))}
      {!gesperrt && <HinzufuegenLeiste angebotId={angebotId} nachId={null} />}
    </div>
  );
}
