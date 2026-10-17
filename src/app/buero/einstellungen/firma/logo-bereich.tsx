"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { neueId } from "@/lib/warteschlange";
import { logoEntfernen, logoSetzen } from "./actions";

const MAX_BYTES = 2 * 1024 * 1024;

/** Firmenlogo hochladen (PNG oder JPEG, höchstens 2 MB). Erscheint im Briefkopf der Angebote. */
export function LogoBereich({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const dateiRef = useRef<HTMLInputElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState(false);
  const [laeuft, starte] = useTransition();

  function waehlen(datei: File | undefined) {
    if (!datei) return;
    setFehler(null);
    const art = datei.type === "image/png" ? "png" : datei.type === "image/jpeg" ? "jpg" : null;
    if (!art) return setFehler("Bitte eine PNG- oder JPEG-Datei wählen.");
    if (datei.size > MAX_BYTES) return setFehler("Die Datei ist zu groß (höchstens 2 MB).");
    starte(async () => {
      const pfad = `logo-${neueId()}.${art}`;
      const { error } = await createBrowserSupabase().storage.from("firmenlogo").upload(pfad, datei, { contentType: datei.type, upsert: false });
      if (dateiRef.current) dateiRef.current.value = "";
      if (error) return setFehler("Das Logo konnte nicht hochgeladen werden. Bitte nochmal versuchen.");
      const r = await logoSetzen(pfad);
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Logo gespeichert");
      router.refresh();
    });
  }

  function entfernen() {
    setFehler(null);
    starte(async () => {
      const r = await logoEntfernen();
      if (r.fehler) return setFehler(r.fehler);
      setFrage(false);
      toast.success("Logo entfernt");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="logo-titel" className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 id="logo-titel" className="flex items-center gap-2 text-lg font-semibold"><ImageIcon className="size-5" /> Logo</h2>
      <p className="text-sm text-muted-foreground">Das Logo steht oben links im Briefkopf der Angebote. PNG oder JPEG, höchstens 2 MB. Am besten mit weißem oder durchsichtigem Hintergrund.</p>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signierte Adresse aus dem privaten Speicher
        <img src={logoUrl} alt="Firmenlogo" className="max-h-24 w-fit max-w-full rounded-lg border bg-white p-2 object-contain" />
      ) : (
        <p className="text-sm text-muted-foreground">Noch kein Logo hochgeladen.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={laeuft} onClick={() => dateiRef.current?.click()}>
          <UploadIcon /> {laeuft ? "Lädt …" : logoUrl ? "Anderes Logo hochladen" : "Logo hochladen"}
        </Button>
        <input ref={dateiRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => waehlen(e.target.files?.[0])} />
        {logoUrl && (frage ? (
          <>
            <Button type="button" variant="destructive" disabled={laeuft} onClick={entfernen}>Wirklich entfernen</Button>
            <Button type="button" variant="ghost" onClick={() => setFrage(false)}>Abbrechen</Button>
          </>
        ) : (
          <Button type="button" variant="ghost" disabled={laeuft} onClick={() => setFrage(true)}><Trash2Icon /> Entfernen</Button>
        ))}
      </div>
    </section>
  );
}
