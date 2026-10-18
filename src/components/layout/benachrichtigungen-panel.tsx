"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, CheckCheckIcon, MessageCircleIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { benachrichtigungenHolen, benachrichtigungenZahl, hinweiseGelesen } from "@/app/buero/actions";
import { ungelesene, type Benachrichtigung } from "@/lib/benachrichtigung";
import { bearbeitetText } from "@/lib/listen-anzeige";
import { BENACHRICHTIGUNGEN_OEFFNEN, useBuero } from "./buero-kontext";

const ABFRAGE_MS = 60_000;

/**
 * Benachrichtigungen wie in Plancraft: Fläche von links neben der Seitenleiste mit den Reitern Ungelesen / Alle und „Alle gelesen“.
 * Die Zahl an der Glocke wird jede Minute neu abgefragt, solange die Seite sichtbar ist. Neue Chat-Nachrichten stehen hier mit,
 * sie gelten erst als gelesen, wenn man den Chat öffnet.
 */
export function BenachrichtigungenPanel() {
  const router = useRouter();
  const { setUngelesen } = useBuero();
  const [offen, setOffen] = useState(false);
  const [reiter, setReiter] = useState<"ungelesen" | "alle">("ungelesen");
  const [liste, setListe] = useState<Benachrichtigung[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [laeuft, starte] = useTransition();
  const laden = useCallback(async () => {
    try {
      const r = await benachrichtigungenHolen();
      setListe(r.liste);
      setUngelesen(r.ungelesen);
      setFehler(false);
    } catch {
      setFehler(true);
    }
  }, [setUngelesen]);

  useEffect(() => {
    const auf = () => {
      setOffen(true);
      void laden();
    };
    window.addEventListener(BENACHRICHTIGUNGEN_OEFFNEN, auf);
    return () => window.removeEventListener(BENACHRICHTIGUNGEN_OEFFNEN, auf);
  }, [laden]);

  // Zahl an der Glocke regelmäßig aktualisieren (nur bei sichtbarer Seite)
  useEffect(() => {
    async function zaehlen() {
      if (document.visibilityState !== "visible") return;
      try {
        setUngelesen(await benachrichtigungenZahl());
      } catch {
        // beim nächsten Mal wieder
      }
    }
    const t = window.setInterval(zaehlen, ABFRAGE_MS);
    document.addEventListener("visibilitychange", zaehlen);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", zaehlen);
    };
  }, [setUngelesen]);

  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => e.key === "Escape" && setOffen(false);
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [offen]);

  function oeffnen(b: Benachrichtigung) {
    setOffen(false);
    if (b.art === "hinweis" && !b.gelesen && b.hinweisId != null) {
      starte(async () => {
        await hinweiseGelesen(b.hinweisId);
        setUngelesen(await benachrichtigungenZahl());
        router.refresh();
      });
    }
    if (b.href) router.push(b.href);
  }

  function alleGelesen() {
    starte(async () => {
      await hinweiseGelesen();
      await laden();
      router.refresh();
    });
  }

  if (!offen) return null;

  const zeigen = liste === null ? [] : reiter === "ungelesen" ? ungelesene(liste) : liste;
  const hatUngelesene = (liste ?? []).some((b) => !b.gelesen && b.art === "hinweis");

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOffen(false)} aria-hidden />
      <aside
        role="dialog"
        aria-label="Benachrichtigungen"
        className="fixed inset-y-0 left-0 z-50 flex w-full max-w-sm flex-col border-r bg-white shadow-xl md:left-(--seitenleiste)"
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">Benachrichtigungen</h2>
          <button
            type="button"
            onClick={alleGelesen}
            disabled={laeuft || !hatUngelesene}
            title="Alle Hinweise als gelesen markieren"
            aria-label="Alle als gelesen markieren"
            className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <CheckCheckIcon className="size-4" />
          </button>
          <button type="button" onClick={() => setOffen(false)} aria-label="Schließen" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <XIcon className="size-4" />
          </button>
        </div>

        <div role="tablist" className="flex gap-4 border-b px-4">
          {(["ungelesen", "alle"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={reiter === r}
              onClick={() => setReiter(r)}
              className={cn("-mb-px border-b-2 py-2 text-[13px]", reiter === r ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {r === "ungelesen" ? "Ungelesen" : "Alle"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {fehler && <p className="p-4 text-[13px] text-destructive">Die Benachrichtigungen konnten nicht geladen werden.</p>}
          {liste === null && !fehler && <p className="p-4 text-[13px] text-muted-foreground">Lädt …</p>}
          {liste !== null && zeigen.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-muted-foreground">
              <BellIcon className="size-8" />
              <p className="text-[13px]">{reiter === "ungelesen" ? "Keine neuen Benachrichtigungen. Zeit für eine kleine Pause." : "Noch keine Benachrichtigungen."}</p>
            </div>
          )}
          <ul className="divide-y">
            {zeigen.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => oeffnen(b)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", b.gelesen ? "bg-transparent" : "bg-primary")} aria-label={b.gelesen ? undefined : "ungelesen"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      {b.art === "chat" && <MessageCircleIcon className="size-3.5 shrink-0" />}
                      <span className="truncate">{b.titel}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-3 block text-[13px] text-muted-foreground">{b.text}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{bearbeitetText(b.zeit)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}
