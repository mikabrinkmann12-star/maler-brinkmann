"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArchiveIcon, ArchiveRestoreIcon, CheckIcon, FolderIcon, FolderPlusIcon, PencilIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Auswahl } from "@/components/feld";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ordnerOptionen, type KatalogArt, type OrdnerEintrag } from "@/lib/katalog";
import { ordnerArchivieren, ordnerSpeichern } from "./actions";

/** „Neuer Ordner“ im aktuellen Ordner (oder auf oberster Ebene). */
export function NeuerOrdner({ art, parentId }: { art: KatalogArt; parentId: string | null }) {
  const [offen, setOffen] = useState(false);
  const [name, setName] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function speichern(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (laeuft) return;
    starte(async () => {
      const r = await ordnerSpeichern(art, null, { name, parentId: parentId ?? "" });
      if (r.fehler) return setFehler(r.fehler);
      toast.success(`Ordner „${name.trim()}“ angelegt.`);
      setName("");
      setFehler(null);
      setOffen(false);
    });
  }

  if (!offen) {
    return (
      <Button type="button" variant="outline" onClick={() => setOffen(true)}>
        <FolderPlusIcon /> Neuer Ordner
      </Button>
    );
  }
  return (
    <form onSubmit={speichern} className="flex flex-wrap items-center gap-2">
      <Input aria-label="Name des neuen Ordners" value={name} autoFocus maxLength={100} placeholder="Name des Ordners"
        onChange={(e) => { setName(e.target.value); setFehler(null); }} className="h-9 w-56" />
      <Button type="submit" disabled={laeuft || !name.trim()}><CheckIcon /> Anlegen</Button>
      <Button type="button" variant="ghost" onClick={() => { setOffen(false); setFehler(null); }}><XIcon /> Abbrechen</Button>
      {fehler && <p role="alert" className="w-full text-sm text-destructive">{fehler}</p>}
    </form>
  );
}

/** Ein Unterordner in der Liste: öffnen, umbenennen/verschieben, archivieren bzw. wiederherstellen. */
export function OrdnerZeile({
  art,
  ordner,
  alle,
  archiviert,
  pfadText,
  href,
}: {
  art: KatalogArt;
  ordner: OrdnerEintrag;
  alle: OrdnerEintrag[];
  archiviert: boolean;
  /** Im Archiv und in der Suche steht der volle Pfad statt nur des Namens */
  pfadText?: string;
  href: string;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [name, setName] = useState(ordner.name);
  const [parentId, setParentId] = useState(ordner.parentId ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const optionen = ordnerOptionen(alle, ordner.id);

  function speichern(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (laeuft) return;
    starte(async () => {
      const r = await ordnerSpeichern(art, ordner.id, { name, parentId });
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Ordner gespeichert.");
      setFehler(null);
      setBearbeiten(false);
    });
  }

  function archivieren(wert: boolean) {
    if (laeuft) return;
    if (wert && !window.confirm(`Ordner „${ordner.name}“ archivieren? (Er muss dafür leer sein.)`)) return;
    starte(async () => {
      const r = await ordnerArchivieren(art, ordner.id, wert);
      if (r.fehler) toast.error(r.fehler);
      else toast.success(wert ? "Ordner archiviert." : "Ordner wiederhergestellt.");
    });
  }

  if (bearbeiten) {
    return (
      <form onSubmit={speichern} className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Input aria-label="Ordnername" value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setFehler(null); }} className="h-9 w-56" />
        <Auswahl aria-label="Übergeordneter Ordner" value={parentId} onChange={(e) => { setParentId(e.target.value); setFehler(null); }} className="h-9 w-64">
          <option value="">Oberste Ebene</option>
          {optionen.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
        </Auswahl>
        <Button type="submit" disabled={laeuft || !name.trim()}><CheckIcon /> Speichern</Button>
        <Button type="button" variant="ghost" onClick={() => { setBearbeiten(false); setName(ordner.name); setParentId(ordner.parentId ?? ""); setFehler(null); }}>
          <XIcon /> Abbrechen
        </Button>
        {fehler && <p role="alert" className="w-full text-sm text-destructive">{fehler}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <FolderIcon className="size-5 shrink-0 text-muted-foreground" />
      {archiviert ? (
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{pfadText ?? ordner.name}</span>
      ) : (
        <Link href={href} className="min-w-0 flex-1 truncate font-medium hover:underline">{pfadText ?? ordner.name}</Link>
      )}
      {!archiviert && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Ordner ${ordner.name} bearbeiten`} onClick={() => setBearbeiten(true)}>
          <PencilIcon />
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon-sm" disabled={laeuft}
        aria-label={archiviert ? `Ordner ${ordner.name} wiederherstellen` : `Ordner ${ordner.name} archivieren`}
        onClick={() => archivieren(!archiviert)}>
        {archiviert ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
      </Button>
    </div>
  );
}
