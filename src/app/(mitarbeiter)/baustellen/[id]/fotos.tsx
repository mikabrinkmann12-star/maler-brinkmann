"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CameraIcon, CloudOffIcon, ImageIcon, ImagePlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  FOTO_KATEGORIEN,
  FOTO_KATEGORIE_NAMEN,
  fotoPfade,
  fotoVorbereiten,
  type FotoKategorie,
} from "@/lib/bild";
import { ausstehendeFotos, fotoMerken, fotoVergessen, type AusstehendesFoto } from "@/lib/foto-speicher";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { neueId } from "@/lib/warteschlange";
import { fotoArchivieren, fotoSpeichern } from "../actions";

export type FotoAnzeige = {
  id: string;
  kategorie: FotoKategorie;
  kommentar: string;
  vorschauUrl: string | null;
  bildUrl: string | null;
  wer: string;
  wann: string;
  darfLoeschen: boolean;
};

type Vorbereitet = { id: string; bild: Blob; vorschau: Blob; breite: number; hoehe: number };
type Status = "laeuft" | "wartet" | { fehler: string };

const MAX_AUF_EINMAL = 10;
const NEUER_VERSUCH_MS = 60_000;
let laedtGerade = false;

/** Speicher-Fehler einordnen: schon vorhanden (ok), abgelehnt (Rechte) oder Netzproblem. */
function speicherFehler(error: { message: string; status?: number; statusCode?: string }): "schon_da" | "abgelehnt" | "netz" {
  const status = error.status ?? Number(error.statusCode);
  if (status === 409 || error.statusCode === "409" || /already exists|duplicate/i.test(error.message)) return "schon_da";
  return status >= 400 && status < 500 ? "abgelehnt" : "netz";
}

/** Bild + Vorschau hochladen, dann den Datensatz anlegen. Darf beliebig oft wiederholt werden. */
async function hochladen(f: AusstehendesFoto): Promise<"ok" | "wartet" | { fehler: string }> {
  const speicher = createBrowserSupabase().storage.from("projektfotos");
  const pfade = fotoPfade(f.projektId, f.id);
  for (const [pfad, blob] of [[pfade.vorschau, f.vorschau], [pfade.bild, f.bild]] as const) {
    try {
      const { error } = await speicher.upload(pfad, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
      if (error) {
        const art = speicherFehler(error as never);
        if (art === "abgelehnt") return { fehler: "Hochladen nicht erlaubt (nur auf eigenen Baustellen)." };
        if (art === "netz") return "wartet";
      }
    } catch {
      return "wartet";
    }
  }
  try {
    const r = await fotoSpeichern({
      id: f.id, projektId: f.projektId, kategorie: f.kategorie, kommentar: f.kommentar,
      breite: f.breite, hoehe: f.hoehe, groesseBytes: f.bild.size,
    });
    return r.fehler ? { fehler: r.fehler } : "ok";
  } catch {
    return "wartet";
  }
}

export function Fotos({
  projektId,
  ichId,
  darfHochladen,
  fotos,
}: {
  projektId: string;
  ichId: string;
  darfHochladen: boolean;
  fotos: FotoAnzeige[];
}) {
  const router = useRouter();
  const kameraRef = useRef<HTMLInputElement>(null);
  const galerieRef = useRef<HTMLInputElement>(null);
  const [vorbereitet, setVorbereitet] = useState<Vorbereitet[]>([]);
  const [bereitet, setBereitet] = useState(false);
  const [kategorie, setKategorie] = useState<FotoKategorie>("sonstiges");
  const [kommentar, setKommentar] = useState("");
  const [ausstehend, setAusstehend] = useState<AusstehendesFoto[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [filter, setFilter] = useState<FotoKategorie | "alle">("alle");
  const [gross, setGross] = useState<FotoAnzeige | null>(null);

  // Vorschau-Adressen für Bilder, die (noch) nur auf dem Gerät liegen
  const vorschauUrls = useMemo(
    () => new Map([...vorbereitet, ...ausstehend].map((f) => [f.id, URL.createObjectURL(f.vorschau)])),
    [vorbereitet, ausstehend],
  );
  useEffect(() => () => vorschauUrls.forEach((u) => URL.revokeObjectURL(u)), [vorschauUrls]);

  const allesSenden = useCallback(
    async (liste: AusstehendesFoto[]) => {
      if (laedtGerade || !liste.length) return;
      laedtGerade = true;
      let fertig = 0;
      try {
        for (const f of liste) {
          setStatus((s) => ({ ...s, [f.id]: "laeuft" }));
          const r = await hochladen(f);
          if (r === "ok") {
            await fotoVergessen(f.id);
            setAusstehend((a) => a.filter((x) => x.id !== f.id));
            fertig++;
          } else {
            if (typeof r === "object") await fotoMerken({ ...f, fehler: r.fehler });
            setStatus((s) => ({ ...s, [f.id]: r }));
            if (r === "wartet") break; // weiter kein Netz
          }
        }
      } finally {
        laedtGerade = false;
      }
      if (fertig) {
        toast.success(fertig === 1 ? "Foto gespeichert." : `${fertig} Fotos gespeichert.`);
        router.refresh();
      }
    },
    [router],
  );

  // Liegengebliebene Fotos beim Öffnen, bei Netz und jede Minute erneut senden
  useEffect(() => {
    let aktiv = true;
    const versuchen = async () => {
      const liste = await ausstehendeFotos(ichId, projektId);
      if (!aktiv) return;
      setAusstehend(liste);
      void allesSenden(liste.filter((f) => !f.fehler));
    };
    void versuchen();
    const beiNetz = () => void versuchen();
    window.addEventListener("online", beiNetz);
    const takt = window.setInterval(beiNetz, NEUER_VERSUCH_MS);
    return () => {
      aktiv = false;
      window.removeEventListener("online", beiNetz);
      window.clearInterval(takt);
    };
  }, [allesSenden, ichId, projektId]);

  async function dateienGewaehlt(ereignis: React.ChangeEvent<HTMLInputElement>) {
    const alle = [...(ereignis.target.files ?? [])];
    ereignis.target.value = ""; // dasselbe Bild darf nochmal gewählt werden
    if (!alle.length) return;
    if (alle.length > MAX_AUF_EINMAL) toast.info(`Höchstens ${MAX_AUF_EINMAL} Fotos auf einmal.`);
    const dateien = alle.slice(0, MAX_AUF_EINMAL);
    setBereitet(true);
    const fertig: Vorbereitet[] = [];
    for (const datei of dateien) {
      try {
        fertig.push({ id: neueId(), ...(await fotoVorbereiten(datei)) });
      } catch {
        toast.error(`„${datei.name}“ kann nicht gelesen werden.`);
      }
    }
    setBereitet(false);
    if (fertig.length) setVorbereitet((v) => [...v, ...fertig]);
  }

  async function absenden() {
    const neue: AusstehendesFoto[] = vorbereitet.map((v) => ({
      ...v, userId: ichId, projektId, kategorie, kommentar: kommentar.trim(), erstelltAm: new Date().toISOString(),
    }));
    for (const f of neue) {
      if (!(await fotoMerken(f))) toast.warning("Das Handy kann Fotos gerade nicht zwischenspeichern. Bitte die Seite offen lassen, bis alles gesendet ist.");
    }
    setAusstehend((a) => [...a, ...neue]);
    setVorbereitet([]);
    setKommentar("");
    await allesSenden(neue);
  }

  async function verwerfen(f: AusstehendesFoto) {
    if (!window.confirm("Dieses Foto verwerfen? Es wird dann nicht gespeichert.")) return;
    await fotoVergessen(f.id);
    setAusstehend((a) => a.filter((x) => x.id !== f.id));
  }

  async function loeschen(f: FotoAnzeige) {
    if (!window.confirm("Dieses Foto löschen?")) return;
    try {
      const r = await fotoArchivieren(f.id);
      if (r.fehler) return toast.error(r.fehler);
      setGross(null);
      toast.success("Foto gelöscht.");
    } catch {
      toast.error("Keine Verbindung. Bitte später nochmal löschen.");
    }
  }

  const sichtbar = filter === "alle" ? fotos : fotos.filter((f) => f.kategorie === filter);
  const vorhandeneKategorien = FOTO_KATEGORIEN.filter((k) => fotos.some((f) => f.kategorie === k));

  return (
    <section id="fotos" className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ImageIcon className="size-5" /> Fotos ({fotos.length})
      </h2>

      {darfHochladen && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="touch" onClick={() => kameraRef.current?.click()} disabled={bereitet}>
              <CameraIcon /> Foto aufnehmen
            </Button>
            <Button type="button" size="touch" variant="outline" onClick={() => galerieRef.current?.click()} disabled={bereitet}>
              <ImagePlusIcon /> Aus Galerie
            </Button>
          </div>
          <input ref={kameraRef} type="file" accept="image/*" capture="environment" hidden onChange={dateienGewaehlt} />
          <input ref={galerieRef} type="file" accept="image/*" multiple hidden onChange={dateienGewaehlt} />
          {bereitet && <p className="text-sm text-muted-foreground" role="status">Foto wird verkleinert …</p>}
        </>
      )}

      {/* Noch nicht hochgeladen */}
      {ausstehend.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950" aria-live="polite">
          {ausstehend.map((f) => {
            const s = status[f.id] ?? (f.fehler ? { fehler: f.fehler } : "wartet");
            return (
              <li key={f.id} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- lokales Vorschaubild */}
                <img src={vorschauUrls.get(f.id)} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                <span className="min-w-0 flex-1 text-sm">
                  {s === "laeuft" ? "Wird hochgeladen …" : s === "wartet" ? (
                    <span className="flex items-center gap-1"><CloudOffIcon className="size-4" /> Wartet auf Netz – liegt sicher auf dem Handy.</span>
                  ) : <span className="text-destructive">{s.fehler}</span>}
                </span>
                {s !== "laeuft" && (
                  <>
                    <Button type="button" variant="outline" size="icon-touch" aria-label="Erneut senden" className="bg-white"
                      onClick={() => void allesSenden([f])}>
                      <RefreshCwIcon />
                    </Button>
                    <Button type="button" variant="outline" size="icon-touch" aria-label="Foto verwerfen" className="bg-white"
                      onClick={() => verwerfen(f)}>
                      <Trash2Icon />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Filter */}
      {vorhandeneKategorien.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Fotos filtern">
          {(["alle", ...vorhandeneKategorien] as const).map((k) => (
            <Button key={k} type="button" size="sm" variant={filter === k ? "default" : "outline"} aria-pressed={filter === k}
              className="h-10 px-3 text-sm" onClick={() => setFilter(k)}>
              {k === "alle" ? "Alle" : FOTO_KATEGORIE_NAMEN[k]}
            </Button>
          ))}
        </div>
      )}

      {fotos.length === 0 && ausstehend.length === 0 && <p className="text-muted-foreground">Noch keine Fotos.</p>}
      {sichtbar.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {sichtbar.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setGross(f)} aria-label={`Foto ${FOTO_KATEGORIE_NAMEN[f.kategorie]} öffnen`}
                className="relative block aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {f.vorschauUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- signierte Speicher-Adresse, keine Bildoptimierung nötig
                  <img src={f.vorschauUrl} alt="" loading="lazy" className="size-full object-cover" />
                )}
                <span className={cn("absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-xs font-medium",
                  f.kategorie === "mangel" ? "bg-red-600 text-white" : "bg-black/60 text-white")}>
                  {FOTO_KATEGORIE_NAMEN[f.kategorie]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Neue Fotos: Kategorie und Kommentar */}
      <Sheet open={vorbereitet.length > 0} onOpenChange={(offen) => {
        if (!offen && window.confirm("Fotos verwerfen? Sie werden dann nicht gespeichert.")) setVorbereitet([]);
      }}>
        <SheetContent side="bottom" className="max-h-[90dvh] gap-4 overflow-y-auto p-4">
          <SheetTitle className="text-lg">{vorbereitet.length === 1 ? "Foto speichern" : `${vorbereitet.length} Fotos speichern`}</SheetTitle>
          <SheetDescription className="sr-only">Art des Fotos wählen und optional einen Kommentar schreiben.</SheetDescription>
          <ul className="flex gap-2 overflow-x-auto">
            {vorbereitet.map((v) => (
              // eslint-disable-next-line @next/next/no-img-element -- lokales Vorschaubild
              <li key={v.id} className="shrink-0"><img src={vorschauUrls.get(v.id)} alt="" className="h-24 rounded-lg object-cover" /></li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Art des Fotos">
            {FOTO_KATEGORIEN.map((k) => (
              <Button key={k} type="button" size="touch" variant={kategorie === k ? "default" : "outline"} aria-pressed={kategorie === k}
                onClick={() => setKategorie(k)}>
                {FOTO_KATEGORIE_NAMEN[k]}
              </Button>
            ))}
          </div>
          <Input aria-label="Kommentar (optional)" placeholder="Kommentar (optional)" maxLength={500} value={kommentar}
            onChange={(e) => setKommentar(e.target.value)} className="h-12 text-base" />
          <Button type="button" size="touch" className="w-full" onClick={() => void absenden()}>
            Speichern
          </Button>
        </SheetContent>
      </Sheet>

      {/* Großansicht */}
      <Dialog open={gross !== null} onOpenChange={(offen) => { if (!offen) setGross(null); }}>
        <DialogContent className="max-h-[95dvh] gap-3 overflow-y-auto p-3 sm:max-w-2xl">
          {gross && (
            <>
              <DialogTitle>{FOTO_KATEGORIE_NAMEN[gross.kategorie]}</DialogTitle>
              <DialogDescription>{gross.wer} · {gross.wann}</DialogDescription>
              {gross.bildUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- signierte Speicher-Adresse
                <img src={gross.bildUrl} alt={gross.kommentar || FOTO_KATEGORIE_NAMEN[gross.kategorie]} className="w-full rounded-lg" />
              )}
              {gross.kommentar && <p className="text-base">{gross.kommentar}</p>}
              {gross.darfLoeschen && (
                <Button type="button" variant="destructive" size="touch" onClick={() => loeschen(gross)}>
                  <Trash2Icon /> Foto löschen
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
