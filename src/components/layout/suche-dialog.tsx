"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BuildingIcon, ClockIcon, FileIcon, FolderIcon, FolderPlusIcon, SearchIcon, UserIcon, UserPlusIcon } from "lucide-react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { suchen, type SuchTreffer } from "@/app/buero/suche-actions";
import { NEUE_ZEIT_OEFFNEN, SUCHE_OEFFNEN } from "./buero-kontext";

const REITER = [
  ["alle", "Alle"],
  ["projekt", "Projekte"],
  ["kontakt", "Kontakte"],
  ["dokument", "Dokumente"],
] as const;
type Reiter = (typeof REITER)[number][0];

const SCHNELLAKTIONEN = [
  { href: "/buero/projekte/neu", text: "Projekt erstellen", icon: FolderPlusIcon },
  { href: "/buero/kontakte/neu", text: "Kontakt erstellen", icon: UserPlusIcon },
  { href: "/buero/zeiten/neu", text: "Zeit erstellen", icon: ClockIcon },
];

const ICON = { projekt: FolderIcon, kontakt: UserIcon, dokument: FileIcon } as const;

/**
 * Suchen-Fenster wie in Plancraft (Strg+K oder „Suchen“ in der Seitenleiste): Suchfeld, Reiter Alle / Projekte / Kontakte / Dokumente,
 * darunter „Schnellaktionen“. Pfeiltasten wählen, Enter öffnet, Esc schließt.
 */
export function SucheDialog() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState("");
  const [reiter, setReiter] = useState<Reiter>("alle");
  const [treffer, setTreffer] = useState<SuchTreffer[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  const neuesteSuche = useRef("");

  // Strg+K / Cmd+K und das Ereignis aus dem Menü öffnen das Fenster
  useEffect(() => {
    const auf = () => setOffen(true);
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOffen((o) => !o);
      }
    };
    window.addEventListener(SUCHE_OEFFNEN, auf);
    window.addEventListener("keydown", taste);
    return () => {
      window.removeEventListener(SUCHE_OEFFNEN, auf);
      window.removeEventListener("keydown", taste);
    };
  }, []);

  function aendern(neu: boolean) {
    setOffen(neu);
    if (!neu) {
      window.clearTimeout(timer.current);
      neuesteSuche.current = "";
      setText("");
      setTreffer([]);
      setReiter("alle");
      setAktiv(0);
      setLaedt(false);
      setFehler(false);
    }
  }

  function tippen(wert: string) {
    setText(wert);
    setAktiv(0);
    window.clearTimeout(timer.current);
    neuesteSuche.current = wert;
    if (wert.trim().length < 2) {
      setTreffer([]);
      setLaedt(false);
      return;
    }
    setLaedt(true);
    timer.current = window.setTimeout(async () => {
      try {
        const r = await suchen(wert);
        if (neuesteSuche.current !== wert) return; // nur die neueste Suche zählt
        setTreffer(r);
        setFehler(false);
      } catch {
        if (neuesteSuche.current === wert) setFehler(true);
      } finally {
        if (neuesteSuche.current === wert) setLaedt(false);
      }
    }, 250);
  }

  const sichtbar = reiter === "alle" ? treffer : treffer.filter((t) => t.art === reiter);
  // Auswahl per Tastatur läuft über Treffer und danach die Schnellaktionen
  const eintraege: { href: string }[] = [...sichtbar, ...SCHNELLAKTIONEN];

  function gehe(href: string) {
    aendern(false);
    // „Zeit erstellen“ öffnet das Fenster „Neue Zeit“ statt einer eigenen Seite
    if (href === "/buero/zeiten/neu") return void window.dispatchEvent(new CustomEvent(NEUE_ZEIT_OEFFNEN));
    router.push(href);
  }

  function taste(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAktiv((a) => (a + 1) % eintraege.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAktiv((a) => (a - 1 + eintraege.length) % eintraege.length);
    } else if (e.key === "Enter" && eintraege[aktiv]) {
      e.preventDefault();
      gehe(eintraege[aktiv].href);
    }
  }

  const zeile = (href: string, index: number, inhalt: React.ReactNode) => (
    <li key={`${href}-${index}`}>
      <button
        type="button"
        onClick={() => gehe(href)}
        onMouseMove={() => setAktiv(index)}
        className={cn("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left", aktiv === index && "bg-muted")}
      >
        {inhalt}
      </button>
    </li>
  );

  return (
    <Dialog open={offen} onOpenChange={aendern}>
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 p-0 sm:max-w-xl" onKeyDown={taste}>
        <DialogTitle className="sr-only">Suchen</DialogTitle>
        <DialogDescription className="sr-only">Projekte, Kontakte und Dokumente durchsuchen oder etwas Neues anlegen.</DialogDescription>
        <label className="flex items-center gap-2.5 border-b px-3.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={text}
            onChange={(e) => tippen(e.target.value)}
            placeholder="Suchen nach Projekten, Kontakten, Dokumenten …"
            aria-label="Suchen"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div role="tablist" className="flex gap-4 border-b px-3.5">
          {REITER.map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={reiter === id}
              onClick={() => { setReiter(id); setAktiv(0); }}
              className={cn("-mb-px border-b-2 py-2 text-[13px]", reiter === id ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {text.trim().length >= 2 && (
            <>
              {laedt && sichtbar.length === 0 && <p className="px-2.5 py-3 text-[13px] text-muted-foreground">Suche läuft …</p>}
              {fehler && <p className="px-2.5 py-3 text-[13px] text-destructive">Die Suche hat nicht geklappt. Bitte nochmal versuchen.</p>}
              {!laedt && !fehler && sichtbar.length === 0 && <p className="px-2.5 py-3 text-[13px] text-muted-foreground">Nichts gefunden.</p>}
              {sichtbar.length > 0 && (
                <ul>
                  {sichtbar.map((t, i) => {
                    const Icon = t.art === "kontakt" && !t.zeile ? BuildingIcon : ICON[t.art];
                    return zeile(
                      t.href,
                      i,
                      <>
                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{t.titel}{t.archiviert && <span className="ml-2 text-xs font-normal text-muted-foreground">archiviert</span>}</span>
                          {t.zeile && <span className="block truncate text-xs text-muted-foreground">{t.zeile}</span>}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{t.art === "projekt" ? "Projekt" : t.art === "kontakt" ? "Kontakt" : "Dokument"}</span>
                      </>,
                    );
                  })}
                </ul>
              )}
            </>
          )}
          {text.trim().length > 0 && text.trim().length < 2 && <p className="px-2.5 py-3 text-[13px] text-muted-foreground">Mindestens 2 Buchstaben eintippen.</p>}

          <p className="px-2.5 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">Schnellaktionen</p>
          <ul>
            {SCHNELLAKTIONEN.map((a, i) =>
              zeile(
                a.href,
                sichtbar.length + i,
                <>
                  <a.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-[13px]">{a.text}</span>
                </>,
              ),
            )}
          </ul>
        </div>

        <div className="flex items-center gap-4 border-t bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground">
          <span><kbd className="rounded border bg-white px-1">↑↓</kbd> Auswählen</span>
          <span><kbd className="rounded border bg-white px-1">↵</kbd> Öffnen</span>
          <span className="ml-auto"><kbd className="rounded border bg-white px-1">Esc</kbd> Schließen</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
