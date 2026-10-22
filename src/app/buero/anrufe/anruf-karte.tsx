"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, ChevronDownIcon, PhoneIncomingIcon, PhoneOutgoingIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KATEGORIEN, KATEGORIE_NAMEN, STATUS_NAMEN, STATUS_WERTE, dauerText, type AnrufKategorie, type AnrufStatus } from "@/lib/anruf";
import { formatDatumZeit } from "@/lib/format";
import { telLink } from "@/lib/projekt";
import { anrufAendern, anrufArchivieren } from "./actions";

export type AnrufZeile = {
  id: string;
  richtung: "eingehend" | "ausgehend";
  vonNummer: string | null;
  beginn: string;
  dauerSek: number | null;
  zusammenfassung: string;
  transkript: string | null;
  kategorie: AnrufKategorie;
  status: AnrufStatus;
  notiz: string;
  archiviert: boolean;
  anbieter: string;
  kontakt: { id: string; name: string } | null;
};

const STATUS_FARBE: Record<AnrufStatus, string> = {
  neu: "bg-amber-100 text-amber-900",
  in_bearbeitung: "bg-blue-100 text-blue-900",
  erledigt: "bg-green-100 text-green-800",
};
const KATEGORIE_FARBE: Record<AnrufKategorie, string> = {
  anfrage: "bg-emerald-100 text-emerald-900",
  information: "bg-sky-100 text-sky-900",
  spam: "bg-red-100 text-red-800",
  sonstiges: "bg-muted text-muted-foreground",
};

const feld = "h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Ein Anruf: Zusammenfassung, Status und Kategorie ändern, Notiz, Transkript, archivieren. */
export function AnrufKarte({ anruf }: { anruf: AnrufZeile }) {
  const router = useRouter();
  const [notiz, setNotiz] = useState(anruf.notiz);
  const [laeuft, starte] = useTransition();
  const Symbol = anruf.richtung === "eingehend" ? PhoneIncomingIcon : PhoneOutgoingIcon;
  const tel = telLink(anruf.vonNummer);

  function senden(eingabe: Parameters<typeof anrufAendern>[0], ok?: string) {
    starte(async () => {
      try {
        const r = await anrufAendern({ id: anruf.id, ...(eingabe as object) });
        if (r.fehler) return void toast.error(r.fehler);
        if (ok) toast.success(ok);
        router.refresh();
      } catch {
        toast.error("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  function archivieren() {
    starte(async () => {
      try {
        const r = await anrufArchivieren({ id: anruf.id, archivieren: !anruf.archiviert });
        if (r.fehler) return void toast.error(r.fehler);
        router.refresh();
      } catch {
        toast.error("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            <Symbol className="size-4 text-muted-foreground" aria-label={anruf.richtung} />
            {anruf.kontakt ? (
              <Link href={`/buero/kontakte/${anruf.kontakt.id}`} className="underline">{anruf.kontakt.name}</Link>
            ) : (
              <span>Unbekannter Anrufer</span>
            )}
            {anruf.vonNummer && (tel ? <a href={tel} className="text-sm font-normal text-muted-foreground underline">{anruf.vonNummer}</a> : <span className="text-sm font-normal text-muted-foreground">{anruf.vonNummer}</span>)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDatumZeit(anruf.beginn)} · {dauerText(anruf.dauerSek)}
            {anruf.anbieter === "manuell" && " · von Hand eingetragen"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${KATEGORIE_FARBE[anruf.kategorie]}`}>{KATEGORIE_NAMEN[anruf.kategorie]}</span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_FARBE[anruf.status]}`}>{STATUS_NAMEN[anruf.status]}</span>
        </div>
      </div>

      <p className="whitespace-pre-line text-sm">{anruf.zusammenfassung || <span className="text-muted-foreground">Keine Zusammenfassung.</span>}</p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Status
          <select className={feld} value={anruf.status} disabled={laeuft} onChange={(e) => senden({ status: e.target.value })}>
            {STATUS_WERTE.map((s) => <option key={s} value={s}>{STATUS_NAMEN[s]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Kategorie
          <select className={feld} value={anruf.kategorie} disabled={laeuft} onChange={(e) => senden({ kategorie: e.target.value })}>
            {KATEGORIEN.map((k) => <option key={k} value={k}>{KATEGORIE_NAMEN[k]}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="ghost" disabled={laeuft} onClick={archivieren} className="ml-auto">
          {anruf.archiviert ? <><ArchiveRestoreIcon /> Wiederherstellen</> : <><ArchiveIcon /> Archivieren</>}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <input
          aria-label="Notiz zum Anruf"
          placeholder="Notiz (z. B. zurückgerufen, Termin vereinbart)"
          maxLength={1000}
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          className={`${feld} min-w-0 flex-1`}
        />
        <Button type="button" size="sm" variant="outline" disabled={laeuft || notiz.trim() === anruf.notiz} onClick={() => senden({ notiz }, "Notiz gespeichert.")}>
          <SaveIcon /> Speichern
        </Button>
      </div>

      {anruf.transkript && (
        <details className="group rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground">
            <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" /> Gesprächstext (Anrufer und KI)
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {anruf.transkript.split("\n").filter((z) => z.trim()).map((zeile, i) => {
              const m = /^(KI|Anrufer):\s*(.*)$/.exec(zeile);
              const ki = m?.[1] === "KI";
              return (
                <li key={i} className={ki ? "flex flex-col items-start" : "flex flex-col items-end"}>
                  <span className="text-[11px] text-muted-foreground">{m ? m[1] : ""}</span>
                  <span className={`max-w-[85%] rounded-xl px-3 py-1.5 ${ki ? "bg-white" : "bg-emerald-100 text-emerald-950"}`}>{m ? m[2] : zeile}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </li>
  );
}
