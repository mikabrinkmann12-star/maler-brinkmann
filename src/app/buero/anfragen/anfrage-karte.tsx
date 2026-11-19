"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailIcon, MapPinIcon, PhoneIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ANFRAGE_STATUS_NAMEN, type AnfrageStatus, type KontaktVorschlag } from "@/lib/anfrage";
import { formatDatumZeit } from "@/lib/format";
import { adresseText, mailLink, telLink } from "@/lib/projekt";
import { anfrageAblehnen } from "./actions";
import { AnfrageAnnehmen, type DublettenAnzeige } from "./anfrage-annehmen";

export type AnfrageZeile = {
  id: string;
  name: string;
  telefon: string | null;
  email: string | null;
  betreff: string;
  nachricht: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  quelle: string;
  status: AnfrageStatus;
  notiz: string;
  eingang: string;
  kontakt: { id: string; name: string } | null;
  vorschlag: KontaktVorschlag;
  dubletten: DublettenAnzeige[];
};

const STATUS_FARBE: Record<AnfrageStatus, string> = {
  neu: "bg-amber-100 text-amber-900",
  angenommen: "bg-green-100 text-green-800",
  abgelehnt: "bg-muted text-muted-foreground",
};

/** Eine Website-Anfrage mit allen Angaben; Annehmen (Kontakt anlegen/verknüpfen) und Ablehnen (nur Status, optional Notiz). */
export function AnfrageKarte({ anfrage, darfAnlegen }: { anfrage: AnfrageZeile; darfAnlegen: boolean }) {
  const router = useRouter();
  const [ablehnenOffen, setAblehnenOffen] = useState(false);
  const [notiz, setNotiz] = useState("");
  const [laeuft, starte] = useTransition();
  const tel = telLink(anfrage.telefon);
  const mail = mailLink(anfrage.email);
  const adresse = adresseText(anfrage);

  function ablehnen() {
    starte(async () => {
      try {
        const r = await anfrageAblehnen({ id: anfrage.id, notiz });
        if (r.fehler) return void toast.error(r.fehler);
        toast.success("Anfrage abgelehnt.");
        setAblehnenOffen(false);
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
          <p className="font-medium">{anfrage.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatDatumZeit(anfrage.eingang)}
            {anfrage.quelle !== "website" && ` · ${anfrage.quelle}`}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_FARBE[anfrage.status]}`}>{ANFRAGE_STATUS_NAMEN[anfrage.status]}</span>
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        {anfrage.telefon && (
          <li className="flex items-center gap-2">
            <PhoneIcon className="size-4 text-muted-foreground" />
            {tel ? <a href={tel} className="underline">{anfrage.telefon}</a> : anfrage.telefon}
          </li>
        )}
        {anfrage.email && (
          <li className="flex items-center gap-2 break-all">
            <MailIcon className="size-4 shrink-0 text-muted-foreground" />
            {mail ? <a href={mail} className="underline">{anfrage.email}</a> : anfrage.email}
          </li>
        )}
        {adresse && (
          <li className="flex items-center gap-2">
            <MapPinIcon className="size-4 text-muted-foreground" /> {adresse}
          </li>
        )}
      </ul>

      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
        {anfrage.betreff && <p className="font-medium">{anfrage.betreff}</p>}
        <p className="whitespace-pre-line break-words">{anfrage.nachricht}</p>
      </div>

      {anfrage.kontakt && (
        <p className="text-sm">
          Kontakt: <Link href={`/buero/kontakte/${anfrage.kontakt.id}`} className="underline">{anfrage.kontakt.name}</Link>
        </p>
      )}
      {anfrage.notiz && <p className="text-sm text-muted-foreground">Notiz: {anfrage.notiz}</p>}

      {anfrage.status !== "angenommen" && (
        <div className="flex flex-wrap items-center gap-2">
          <AnfrageAnnehmen anfrageId={anfrage.id} vorschlag={anfrage.vorschlag} dubletten={anfrage.dubletten} darfAnlegen={darfAnlegen} />
          {anfrage.status === "neu" && !ablehnenOffen && (
            <Button type="button" size="sm" variant="outline" disabled={laeuft} onClick={() => setAblehnenOffen(true)}>
              <XIcon /> Ablehnen
            </Button>
          )}
          {anfrage.dubletten.length > 0 && <span className="text-xs text-amber-800">Kontakt gibt es vermutlich schon</span>}
        </div>
      )}

      {ablehnenOffen && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <input
            aria-label="Notiz zum Ablehnen (optional)"
            placeholder="Notiz (optional, z. B. kein Malerauftrag)"
            maxLength={1000}
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="destructive" disabled={laeuft} onClick={ablehnen}>Ablehnen</Button>
            <Button type="button" size="sm" variant="ghost" disabled={laeuft} onClick={() => setAblehnenOffen(false)}>Abbrechen</Button>
          </div>
        </div>
      )}
    </li>
  );
}
