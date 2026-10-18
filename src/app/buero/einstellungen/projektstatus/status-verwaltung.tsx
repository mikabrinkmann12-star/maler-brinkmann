"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { StatusPille } from "@/components/status-pille";
import { Button } from "@/components/ui/button";
import { statusAendern, statusAnlegen, statusVerschieben } from "./actions";

export type StatusZeile = { id: string; name: string; farbe: string; aktiv: boolean };

const EINGABE = "h-8 min-w-0 flex-1 rounded-md border border-border bg-white px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
const FARBFELD = "size-8 shrink-0 cursor-pointer rounded-md border border-border bg-white p-0.5";

/** Projektstatus wie „Status verwalten“ in Plancraft: Pille mit Farbe, umbenennen, Reihenfolge, ausblenden, neuen Status hinzufügen. */
export function StatusVerwaltung({ status }: { status: StatusZeile[] }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [neuName, setNeuName] = useState("");
  const [neuFarbe, setNeuFarbe] = useState("#3b82f6");
  const [fehler, setFehler] = useState<string | null>(null);

  function ausfuehren(f: () => Promise<{ fehler?: string }>, ok?: string) {
    starte(async () => {
      const r = await f();
      if (r.fehler) return setFehler(r.fehler);
      setFehler(null);
      if (ok) toast.success(ok);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {fehler && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{fehler}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!neuName.trim()) return;
          ausfuehren(async () => {
            const r = await statusAnlegen({ name: neuName, farbe: neuFarbe });
            if (!r.fehler) setNeuName("");
            return r;
          }, "Status hinzugefügt.");
        }}
        className="flex items-center gap-2"
      >
        <input type="color" aria-label="Farbe des neuen Status" value={neuFarbe} onChange={(e) => setNeuFarbe(e.target.value)} className={FARBFELD} />
        <input aria-label="Name des neuen Status" value={neuName} onChange={(e) => { setNeuName(e.target.value); setFehler(null); }} maxLength={60} placeholder="Neuen Status hinzufügen …" className={EINGABE} />
        <Button type="submit" className="h-8 px-3 text-[13px]" disabled={laeuft || !neuName.trim()}><PlusIcon className="size-3.5" /> Hinzufügen</Button>
      </form>

      <ul className="flex flex-col gap-2">
        {status.map((s, i) => (
          <Zeile key={`${s.id}-${s.name}-${s.farbe}-${s.aktiv}`} s={s} erste={i === 0} letzte={i === status.length - 1} laeuft={laeuft} ausfuehren={ausfuehren} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Ausgeblendete Status lassen sich bei Projekten nicht mehr neu wählen. Projekte, die schon so stehen, behalten ihn. Gelöscht wird nichts.
      </p>
    </div>
  );
}

function Zeile({
  s, erste, letzte, laeuft, ausfuehren,
}: {
  s: StatusZeile;
  erste: boolean;
  letzte: boolean;
  laeuft: boolean;
  ausfuehren: (f: () => Promise<{ fehler?: string }>, ok?: string) => void;
}) {
  const [name, setName] = useState(s.name);
  const [farbe, setFarbe] = useState(s.farbe);
  const geaendert = name.trim() !== s.name || farbe.toLowerCase() !== s.farbe.toLowerCase();

  return (
    <li className={`flex items-center gap-2 rounded-lg border bg-white p-2 ${s.aktiv ? "" : "opacity-60"}`}>
      <div className="flex flex-col">
        <button type="button" aria-label={`${s.name} nach oben`} disabled={laeuft || erste} onClick={() => ausfuehren(() => statusVerschieben(s.id, "hoch"))} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent">
          <ArrowUpIcon className="size-3.5" />
        </button>
        <button type="button" aria-label={`${s.name} nach unten`} disabled={laeuft || letzte} onClick={() => ausfuehren(() => statusVerschieben(s.id, "runter"))} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent">
          <ArrowDownIcon className="size-3.5" />
        </button>
      </div>
      <input type="color" aria-label={`Farbe von ${s.name}`} value={farbe} onChange={(e) => setFarbe(e.target.value)} className={FARBFELD} />
      <input aria-label={`Name von ${s.name}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={EINGABE} />
      <span className="hidden w-40 shrink-0 sm:block"><StatusPille name={name.trim() || "…"} farbe={farbe} /></span>
      {geaendert && (
        <Button type="button" className="h-8 px-3 text-[13px]" disabled={laeuft || !name.trim()} onClick={() => ausfuehren(() => statusAendern(s.id, { name, farbe, aktiv: s.aktiv }), "Status gespeichert.")}>
          Speichern
        </Button>
      )}
      <button
        type="button"
        aria-label={s.aktiv ? `${s.name} ausblenden` : `${s.name} einblenden`}
        title={s.aktiv ? "Ausblenden" : "Einblenden"}
        disabled={laeuft}
        onClick={() => ausfuehren(() => statusAendern(s.id, { name: s.name, farbe: s.farbe, aktiv: !s.aktiv }), s.aktiv ? "Status ausgeblendet." : "Status wieder sichtbar.")}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {s.aktiv ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
      </button>
    </li>
  );
}
