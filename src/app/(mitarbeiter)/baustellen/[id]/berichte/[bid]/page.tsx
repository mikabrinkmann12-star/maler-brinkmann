import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DownloadIcon, FileTextIcon } from "lucide-react";
import { BerichtAnzeige } from "@/components/bericht-anzeige";
import { SeitenKopf } from "@/components/layout/seiten-kopf";
import { buttonVariants } from "@/components/ui/button";
import { BERICHT_ART_NAMEN, datenLesen, istBerichtArt, verweise } from "@/lib/bericht";
import { berichtAngaben, berichtKontext, projektFotos } from "@/lib/bericht-daten";
import { formatDatum, formatDatumZeit } from "@/lib/format";
import { BerichtEntfernen } from "../bericht-entfernen";
import { BerichtAssistent } from "../bericht-assistent";

export const metadata: Metadata = { title: "Bericht" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BerichtSeite({ params }: { params: Promise<{ id: string; bid: string }> }) {
  const { id, bid } = await params;
  const k = await berichtKontext(id);
  if (!UUID.test(bid)) notFound();
  const { data: b } = await k.supabase
    .from("project_reports")
    .select("id, art, datum, status, daten, erstellt_von, unterschrift_name, unterschrift_pfad, unterschrieben_am, abgeschlossen_am, created_at")
    .eq("id", bid)
    .eq("project_id", id)
    .is("archiviert_am", null)
    .maybeSingle();
  if (!b || !istBerichtArt(b.art)) notFound();

  const art = b.art;
  const daten = datenLesen(art, b.daten);
  const meiner = b.erstellt_von === k.nutzer.id;
  const bearbeitbar = b.status === "entwurf" && k.darfSchreiben && (meiner || k.istBuero);
  const { info, personen } = await berichtAngaben(k);
  const personName = (uid: string) => personen.find((p) => p.id === uid)?.name ?? k.namen.get(uid) ?? "Ehemaliger Kollege";

  // Entwurf: Assistent zum Weiterschreiben
  if (bearbeitbar) {
    const fotos = await projektFotos(k);
    return (
      <BerichtAssistent
        projektId={id}
        berichtId={b.id}
        art={art}
        startDatum={b.datum}
        start={daten}
        gespeichertStart
        info={info}
        personen={personen}
        fotos={fotos}
      />
    );
  }

  // Nur ansehen: abgeschlossene Berichte (und fremde Entwürfe)
  const [fotos, unterschrift] = await Promise.all([
    projektFotos(k, verweise(art, daten).fotos),
    b.unterschrift_pfad ? k.supabase.storage.from("berichtunterschriften").createSignedUrl(b.unterschrift_pfad, 3600) : Promise.resolve({ data: null }),
  ]);
  const titel = `${BERICHT_ART_NAMEN[art]} - ${formatDatum(b.datum)}`;

  return (
    <div className="flex flex-col gap-4">
      <SeitenKopf titel={titel} zurueck={`/baustellen/${id}/berichte`} />
      <p className="text-center text-sm text-muted-foreground">
        {b.status === "entwurf" ? `Entwurf von ${k.wer(b.erstellt_von)}` : `Abgeschlossen am ${formatDatumZeit(b.abgeschlossen_am)} · ${k.wer(b.erstellt_von)}`}
      </p>

      {b.status === "abgeschlossen" && (
        <div className="flex flex-col gap-2">
          <a href={`/baustellen/${id}/berichte/${b.id}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ size: "touch", className: "w-full" })}>
            <FileTextIcon /> PDF ansehen
          </a>
          <a href={`/baustellen/${id}/berichte/${b.id}/pdf?download=1`} className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}>
            <DownloadIcon /> PDF herunterladen
          </a>
        </div>
      )}

      <BerichtAnzeige
        art={art}
        datum={b.datum}
        daten={daten}
        info={{ ...info, erstelltVon: daten.allgemein.erstelltVon ? personName(daten.allgemein.erstelltVon) : "" }}
        personName={personName}
        fotos={fotos}
      />

      {b.status === "abgeschlossen" && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Unterschrift</h2>
          {unterschrift.data?.signedUrl ? (
            <div className="rounded-xl border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={unterschrift.data.signedUrl} alt={`Unterschrift von ${b.unterschrift_name}`} className="mx-auto max-h-32" />
              <p className="mt-2 border-t pt-2 text-sm text-muted-foreground">{b.unterschrift_name} · {formatDatumZeit(b.unterschrieben_am)}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">Ohne Unterschrift abgeschlossen.</p>
          )}
        </section>
      )}

      {(k.istBuero || (meiner && b.status === "entwurf")) && <BerichtEntfernen projektId={id} berichtId={b.id} />}
    </div>
  );
}
