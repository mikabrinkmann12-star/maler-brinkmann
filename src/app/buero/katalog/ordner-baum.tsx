"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArchiveIcon, EllipsisIcon, FolderPlusIcon, PencilIcon } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ordnerOptionen, type BaumKnoten, type KatalogArt, type OrdnerEintrag } from "@/lib/katalog";
import { ordnerArchivieren, ordnerSpeichern } from "./actions";

type Dialogziel = { modus: "neu"; parentId: string | null } | { modus: "bearbeiten"; ordner: OrdnerEintrag };

/**
 * Ordnerliste links im Stil von Plancraft: „Alle Leistungen“ mit Anzahl, darunter der Ordnerbaum mit Anzahl je Ordner
 * (Unterordner eingerückt), unten „+ Ordner“. Je Ordner ein Menü: Unterordner anlegen, Umbenennen/Verschieben, Archivieren.
 */
export function OrdnerBaum({
  art,
  baum,
  alle,
  gesamt,
  aktuell,
  adresseBasis,
}: {
  art: KatalogArt;
  baum: BaumKnoten[];
  /** Alle aktiven Ordner (zum Auswählen des übergeordneten Ordners) */
  alle: OrdnerEintrag[];
  gesamt: number;
  /** Gewählter Ordner (null = alle) */
  aktuell: string | null;
  /** Adresse der Liste ohne Ordner, z. B. „art=leistung&q=wand“ (Funktionen dürfen nicht vom Server an den Browser gereicht werden) */
  adresseBasis: string;
}) {
  const adresse = (ordnerId: string | null) => `/buero/katalog?${adresseBasis}${ordnerId ? `&ordner=${ordnerId}` : ""}`;
  const router = useRouter();
  const [ziel, setZiel] = useState<Dialogziel | null>(null);
  const [laeuft, starte] = useTransition();
  const alleName = art === "material" ? "Alle Materialien" : "Alle Leistungen";

  function archivieren(o: BaumKnoten) {
    if (!window.confirm(`Ordner „${o.name}“ archivieren? (Er muss dafür leer sein.)`)) return;
    starte(async () => {
      const r = await ordnerArchivieren(art, o.id, true);
      if (r.fehler) toast.error(r.fehler);
      else {
        toast.success("Ordner archiviert.");
        if (aktuell === o.id) router.push(adresse(null));
        else router.refresh();
      }
    });
  }

  const zeile = (k: BaumKnoten, tiefe: number): React.ReactNode => (
    <li key={k.id}>
      <div className={cn("group/ordner flex items-center rounded-md hover:bg-muted", aktuell === k.id && "bg-muted font-semibold")}>
        <Link href={adresse(k.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-[13px]" style={{ paddingLeft: `${0.5 + tiefe * 0.9}rem` }}>
          <span className="min-w-0 flex-1 truncate">{k.name}</span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{k.gesamt}</span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`Ordner ${k.name}: Aktionen`} disabled={laeuft} className="mr-1 flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 outline-none group-hover/ordner:opacity-100 hover:bg-white focus-visible:opacity-100 data-popup-open:opacity-100">
            <EllipsisIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setZiel({ modus: "neu", parentId: k.id })}><FolderPlusIcon /> Unterordner anlegen</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setZiel({ modus: "bearbeiten", ordner: { id: k.id, parentId: k.parentId, name: k.name } })}><PencilIcon /> Umbenennen / verschieben</DropdownMenuItem>
            <DropdownMenuItem onClick={() => archivieren(k)}><ArchiveIcon /> Archivieren</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {k.kinder.length > 0 && <ul>{k.kinder.map((c) => zeile(c, tiefe + 1))}</ul>}
    </li>
  );

  return (
    <nav aria-label="Ordner" className="flex flex-col gap-1">
      <Link href={adresse(null)} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted", aktuell === null && "bg-muted font-semibold")}>
        <span className="flex-1">{alleName}</span>
        <span className="text-xs font-normal text-muted-foreground tabular-nums">{gesamt}</span>
      </Link>
      <ul>{baum.map((k) => zeile(k, 0))}</ul>
      <button type="button" onClick={() => setZiel({ modus: "neu", parentId: aktuell })} className="mt-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] font-medium hover:bg-muted">
        <FolderPlusIcon className="size-3.5" /> Ordner
      </button>
      <OrdnerDialog art={art} ziel={ziel} alle={alle} onSchliessen={() => setZiel(null)} />
    </nav>
  );
}

function OrdnerDialog({ art, ziel, alle, onSchliessen }: { art: KatalogArt; ziel: Dialogziel | null; alle: OrdnerEintrag[]; onSchliessen: () => void }) {
  // Der Dialog wird je Ziel neu aufgebaut, damit die Felder mit den richtigen Startwerten beginnen
  return (
    <Dialog open={ziel !== null} onOpenChange={(o) => !o && onSchliessen()}>
      {ziel && <OrdnerFormular key={ziel.modus === "neu" ? `neu-${ziel.parentId}` : ziel.ordner.id} art={art} ziel={ziel} alle={alle} onSchliessen={onSchliessen} />}
    </Dialog>
  );
}

function OrdnerFormular({ art, ziel, alle, onSchliessen }: { art: KatalogArt; ziel: Dialogziel; alle: OrdnerEintrag[]; onSchliessen: () => void }) {
  const router = useRouter();
  const bearbeiten = ziel.modus === "bearbeiten";
  const [name, setName] = useState(bearbeiten ? ziel.ordner.name : "");
  const [parentId, setParentId] = useState((bearbeiten ? ziel.ordner.parentId : ziel.parentId) ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const optionen = ordnerOptionen(alle, bearbeiten ? ziel.ordner.id : undefined);

  function speichern(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (laeuft) return;
    starte(async () => {
      const r = await ordnerSpeichern(art, bearbeiten ? ziel.ordner.id : null, { name, parentId });
      if (r.fehler) return setFehler(r.fehler);
      toast.success(bearbeiten ? "Ordner gespeichert." : `Ordner „${name.trim()}“ angelegt.`);
      onSchliessen();
      router.refresh();
    });
  }

  return (
    <DialogContent className="sm:max-w-md">
      <form onSubmit={speichern} className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{bearbeiten ? "Ordner bearbeiten" : "Neuer Ordner"}</DialogTitle>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-[13px]">
          Name
          <input autoFocus value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setFehler(null); }} placeholder="Name des Ordners" className="h-8 rounded-md border bg-white px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30" />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          Liegt in
          <select value={parentId} onChange={(e) => { setParentId(e.target.value); setFehler(null); }} className="h-8 rounded-md border bg-white px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
            <option value="">Oberste Ebene</option>
            {optionen.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
          </select>
        </label>
        {fehler && <p role="alert" className="text-[13px] text-destructive">{fehler}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" className="h-8 px-3 text-[13px]" onClick={onSchliessen}>Abbrechen</Button>
          <Button type="submit" className="h-8 px-3 text-[13px]" disabled={laeuft || !name.trim()}>{bearbeiten ? "Speichern" : "Anlegen"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
