"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LinkIcon, MailIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { FilterKnopf } from "@/components/listen/filter-knopf";
import { MehrfachListe, type ListenOption } from "@/components/listen/mehrfach-liste";
import { useUrlFilter } from "@/components/listen/url-filter";
import { StatusPille } from "@/components/status-pille";
import { Button } from "@/components/ui/button";
import {
  EINGANG_ACCEPT,
  EINGANG_ANZEIGE_FARBEN,
  EINGANG_ANZEIGE_NAMEN,
  eingangDateiPruefen,
  eingangPfad,
  type EingangAnzeige,
} from "@/lib/eingangsrechnung";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { neueId } from "@/lib/warteschlange";
import { eingangsrechnungAnlegen, eingangsrechnungHashPruefen, eingangsrechnungZahlstatus, postfachJetztAbrufen } from "./actions";

/** Reiter „Alle Rechnungen“ / „Zu prüfen (n)“; die übrigen Filter bleiben erhalten. */
export function EingangReiter({ aktiv, zuPruefen }: { aktiv: "alle" | "pruefen"; zuPruefen: number }) {
  const { setzen } = useUrlFilter();
  const reiter = [
    ["alle", "Alle Rechnungen"],
    ["pruefen", "Zu prüfen"],
  ] as const;
  return (
    <nav aria-label="Eingangsrechnungen" className="flex gap-5 border-b">
      {reiter.map(([id, text]) => (
        <button
          key={id}
          type="button"
          aria-current={aktiv === id ? "page" : undefined}
          onClick={() => setzen({ tab: id === "pruefen" ? "pruefen" : null })}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-[13px] transition-colors",
            aktiv === id ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {text}
          {id === "pruefen" && zuPruefen > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] font-medium text-black">{zuPruefen}</span>}
        </button>
      ))}
    </nav>
  );
}

/** Filter „Zuweisung“ (Vollständig / Nicht zugewiesen), Teil der Filterzeile. */
export function ZuweisungFilter({ gewaehlt, optionen }: { gewaehlt: string[]; optionen: ListenOption[] }) {
  const { setzen } = useUrlFilter();
  return (
    <FilterKnopf icon={<LinkIcon />} label="Zuweisung" aktiv={gewaehlt.length > 0} anzahl={gewaehlt.length} breite="w-60">
      <MehrfachListe suche={false} optionen={optionen} gewaehlt={gewaehlt} onAendern={(ids) => setzen({ zuweisung: ids.join(",") || null })} />
    </FilterKnopf>
  );
}

/** Zahlstatus als Pille; ein Klick wechselt zwischen Offen/Überfällig und Bezahlt. */
export function ZahlstatusPille({ id, anzeige }: { id: string; anzeige: EingangAnzeige }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  return (
    <button
      type="button"
      title={anzeige === "bezahlt" ? "Als offen markieren" : "Als bezahlt markieren"}
      disabled={laeuft}
      onClick={(e) => {
        e.stopPropagation();
        starte(async () => {
          const r = await eingangsrechnungZahlstatus(id, anzeige !== "bezahlt");
          if (r.fehler) return void toast.error(r.fehler);
          router.refresh();
        });
      }}
      className="relative z-10 rounded-full focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60"
    >
      <StatusPille name={EINGANG_ANZEIGE_NAMEN[anzeige]} farbe={EINGANG_ANZEIGE_FARBEN[anzeige]} />
    </button>
  );
}

async function sha256(datei: File): Promise<string> {
  const puffer = await crypto.subtle.digest("SHA-256", await datei.arrayBuffer());
  return [...new Uint8Array(puffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const MAX_AUF_EINMAL = 20;

/** „Rechnung hinzufügen“: Dateien wählen, hochladen, automatisch auslesen. Eine einzelne Datei öffnet gleich die Prüfung. */
export function RechnungHinzufuegen() {
  const router = useRouter();
  const wahlRef = useRef<HTMLInputElement>(null);
  const [laeuft, starte] = useTransition();
  const [fortschritt, setFortschritt] = useState("");

  function waehlen(liste: FileList | null) {
    if (!liste || liste.length === 0) return;
    const dateien = [...liste].slice(0, MAX_AUF_EINMAL);
    if (liste.length > MAX_AUF_EINMAL) toast.message(`Es werden nur die ersten ${MAX_AUF_EINMAL} Dateien hochgeladen.`);
    starte(async () => {
      const speicher = createBrowserSupabase().storage.from("eingangsrechnungen");
      let neu = 0;
      let pruefen = 0;
      let doppelt = 0;
      let letzteId: string | null = null;
      for (const [i, datei] of dateien.entries()) {
        setFortschritt(`${i + 1} von ${dateien.length}: ${datei.name}`);
        const art = eingangDateiPruefen(datei.name, datei.size);
        if (!art.ok) {
          toast.error(art.fehler);
          continue;
        }
        const hash = await sha256(datei);
        const vorab = await eingangsrechnungHashPruefen(hash);
        if (vorab.vorhanden) {
          doppelt += 1;
          continue;
        }
        const id = neueId();
        const { error } = await speicher.upload(eingangPfad(id, art.endung), datei, { contentType: art.typ, upsert: false });
        if (error) {
          toast.error(`„${datei.name}“ konnte nicht hochgeladen werden. Bitte nochmal versuchen (Netz prüfen).`);
          continue;
        }
        const r = await eingangsrechnungAnlegen({ id, dateiname: datei.name, groesseBytes: datei.size });
        if (r.fehler) {
          toast.error(r.fehler);
          continue;
        }
        if (r.doppelt) {
          doppelt += 1;
          continue;
        }
        neu += 1;
        if (r.zuPruefen) pruefen += 1;
        letzteId = r.id ?? null;
      }
      setFortschritt("");
      if (wahlRef.current) wahlRef.current.value = "";
      if (doppelt > 0) toast.message(doppelt === 1 ? "Diese Rechnung gibt es schon und wurde nicht noch einmal angelegt." : `${doppelt} Rechnungen gab es schon und wurden nicht noch einmal angelegt.`);
      if (neu === 0) return;
      toast.success(neu === 1 ? "Rechnung hinzugefügt" : `${neu} Rechnungen hinzugefügt${pruefen ? `, ${pruefen} davon zu prüfen` : ""}`);
      if (neu === 1 && letzteId) router.push(`/buero/eingangsrechnungen/${letzteId}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      {laeuft && fortschritt && <span className="max-w-64 truncate text-xs text-muted-foreground">{fortschritt}</span>}
      <Button type="button" disabled={laeuft} className="h-8 px-3 text-[13px]" onClick={() => wahlRef.current?.click()}>
        <PlusIcon className="size-3.5" /> {laeuft ? "Lädt hoch …" : "Rechnung hinzufügen"}
      </Button>
      <input ref={wahlRef} type="file" multiple accept={EINGANG_ACCEPT} className="hidden" onChange={(e) => waehlen(e.target.files)} />
    </div>
  );
}

/** „Postfach abrufen“: holt neue Rechnungen aus dem E-Mail-Postfach (nur sichtbar, wenn es eingerichtet ist). */
export function PostfachAbrufen() {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={laeuft}
      className="h-8 px-3 text-[13px]"
      onClick={() =>
        starte(async () => {
          const r = await postfachJetztAbrufen();
          if (r.fehler) return void toast.error(r.fehler);
          const e = r.ergebnis;
          if (!e) return;
          if (e.fehler.length) toast.error(e.fehler[0]);
          if (e.neu > 0) toast.success(`${e.neu} neue ${e.neu === 1 ? "Rechnung" : "Rechnungen"} aus dem Postfach${e.zuPruefen ? `, ${e.zuPruefen} zu prüfen` : ""}`);
          else if (!e.fehler.length) toast.message(e.mails === 0 ? "Keine neuen Mails im Postfach." : `${e.mails} Mails gelesen, keine neue Rechnung gefunden.`);
          router.refresh();
        })
      }
    >
      <MailIcon className="size-3.5" /> {laeuft ? "Ruft ab …" : "Postfach abrufen"}
    </Button>
  );
}
