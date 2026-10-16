"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { toast } from "sonner";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBetrag } from "@/lib/format";
import {
  EINHEITEN,
  MAX_PREIS,
  ordnerOptionen,
  preisLesen,
  vkBerechnen,
  zuschlagLesen,
  type KatalogArt,
  type OrdnerEintrag,
} from "@/lib/katalog";
import { leistungSchema, materialSchema } from "@/lib/katalog-schema";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { eintragArchivieren, eintragSpeichern } from "./actions";

export type KatalogStart = {
  folderId: string;
  /** Artikelnummer (Material) bzw. Nummer (Leistung) */
  nummer: string;
  name: string;
  /** Beschreibung (Material) bzw. Langtext (Leistung) */
  text: string;
  lieferant: string;
  einheit: string;
  /** Einkaufspreis (Material) bzw. Kosten (Leistung) als Eingabetext */
  preis: string;
  zuschlag: string;
};

/** Material oder Leistung anlegen bzw. ändern (Büro/Admin). Der Verkaufspreis wird live berechnet. */
export function KatalogFormular({
  art,
  id,
  start,
  ordner,
  archiviert,
}: {
  art: KatalogArt;
  id: string | null;
  start: KatalogStart;
  /** Alle aktiven Ordner dieser Art */
  ordner: OrdnerEintrag[];
  archiviert: boolean;
}) {
  const router = useRouter();
  const istMaterial = art === "material";
  const [w, setW] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const optionen = ordnerOptionen(ordner);

  const f = (feld: keyof KatalogStart) => ({
    value: w[feld],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setW((alt) => ({ ...alt, [feld]: e.target.value }));
      setFehler(null);
    },
  });

  // Live-Vorschau des Verkaufspreises (leer = 0, wie beim Speichern)
  const ek = w.preis.trim() === "" ? 0 : preisLesen(w.preis);
  const zuschlag = w.zuschlag.trim() === "" ? 0 : zuschlagLesen(w.zuschlag);
  const vk = ek != null && ek <= MAX_PREIS && zuschlag != null ? vkBerechnen(ek, zuschlag) : null;

  function eingabe() {
    return istMaterial
      ? { folderId: w.folderId, artikelnr: w.nummer, name: w.name, beschreibung: w.text, lieferant: w.lieferant, einheit: w.einheit, ek: w.preis, zuschlag: w.zuschlag }
      : { folderId: w.folderId, nummer: w.nummer, name: w.name, langtext: w.text, einheit: w.einheit, kosten: w.preis, zuschlag: w.zuschlag };
  }

  function speichern(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    if (laeuft) return;
    const werte = eingabe();
    const pruefung = (istMaterial ? materialSchema : leistungSchema).safeParse(werte);
    if (!pruefung.success) return setFehler(ersteMeldung(pruefung.error));

    setFehler(null);
    starte(async () => {
      const r = await eintragSpeichern(art, id, werte);
      if (r.fehler) return setFehler(r.fehler);
      toast.success(id ? "Änderung gespeichert." : `${istMaterial ? "Material" : "Leistung"} angelegt.`);
      router.push(`/buero/katalog?art=${art}${w.folderId ? `&ordner=${w.folderId}` : ""}`);
    });
  }

  function archivieren(wert: boolean) {
    if (!id || laeuft) return;
    starte(async () => {
      const r = await eintragArchivieren(art, id, wert);
      if (r.fehler) return setFehler(r.fehler);
      toast.success(wert ? "Archiviert." : "Wiederhergestellt.");
      router.push(`/buero/katalog?art=${art}${w.folderId ? `&ordner=${w.folderId}` : ""}`);
    });
  }

  return (
    <form onSubmit={speichern} className="flex max-w-2xl flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {archiviert && <FormularMeldung art="hinweis">Dieser Eintrag ist archiviert. Zum Bearbeiten bitte zuerst wiederherstellen.</FormularMeldung>}

      <Feld label={istMaterial ? "Bezeichnung" : "Kurztext"} htmlFor="name">
        <Input id="name" required maxLength={200} {...f("name")} className="h-11 text-base" />
      </Feld>

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label={istMaterial ? "Artikelnummer (optional)" : "Nummer (optional)"} htmlFor="nummer">
          <Input id="nummer" maxLength={50} {...f("nummer")} className="h-11 text-base" />
        </Feld>
        {istMaterial && (
          <Feld label="Lieferant (optional)" htmlFor="lieferant">
            <Input id="lieferant" maxLength={100} {...f("lieferant")} className="h-11 text-base" />
          </Feld>
        )}
      </div>

      <Feld label={istMaterial ? "Beschreibung (optional)" : "Langtext (optional)"} htmlFor="text"
        hinweis={istMaterial ? undefined : "Erscheint später im Angebot unter dem Kurztext."}>
        <textarea id="text" rows={istMaterial ? 3 : 6} maxLength={istMaterial ? 2000 : 5000} {...f("text")}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      </Feld>

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label="Ordner" htmlFor="ordner">
          <Auswahl id="ordner" {...f("folderId")}>
            <option value="">Ohne Ordner</option>
            {optionen.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
          </Auswahl>
        </Feld>
        <Feld label="Einheit" htmlFor="einheit" hinweis="z. B. Stk, m², Std. Eigene Einheiten sind möglich.">
          <Input id="einheit" required maxLength={20} list="einheiten" {...f("einheit")} className="h-11 text-base" />
          <datalist id="einheiten">{EINHEITEN[art].map((e) => <option key={e} value={e} />)}</datalist>
        </Feld>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
        <legend className="px-1 text-base font-medium">Preis</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Feld label={istMaterial ? "Einkaufspreis (€)" : "Kosten (€)"} htmlFor="preis" hinweis="bis 4 Nachkommastellen, z. B. 12,50">
            <Input id="preis" inputMode="decimal" placeholder="0,00" {...f("preis")} className="h-11 text-base" />
          </Feld>
          <Feld label="Zuschlag (%)" htmlFor="zuschlag" hinweis="z. B. 25 oder 12,5">
            <Input id="zuschlag" inputMode="decimal" placeholder="0" {...f("zuschlag")} className="h-11 text-base" />
          </Feld>
          <div className="flex flex-col gap-2">
            <p className="text-base font-medium">Verkaufspreis (VK)</p>
            <p className="flex h-11 items-center rounded-lg bg-muted px-3 text-lg font-semibold tabular-nums" role="status" aria-live="polite">
              {vk != null ? formatBetrag(vk) : "–"}
            </p>
            <p className="text-sm text-muted-foreground">
              {vk != null && ek != null ? `Aufschlag ${formatBetrag(Math.round((vk - ek) * 100) / 100)}` : "wird berechnet"}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Der Verkaufspreis ist immer Einkaufspreis × (1 + Zuschlag) und wird auf Cent gerundet.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={laeuft || archiviert}>
          {laeuft ? "Speichern …" : id ? "Änderung speichern" : "Speichern"}
        </Button>
        {id && (
          <Button type="button" variant="outline" size="lg" className="ml-auto" disabled={laeuft} onClick={() => archivieren(!archiviert)}>
            {archiviert ? <><ArchiveRestoreIcon /> Wiederherstellen</> : <><ArchiveIcon /> Archivieren</>}
          </Button>
        )}
      </div>
    </form>
  );
}
