import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, DownloadIcon, FileTextIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BERICHT_ART_NAMEN, datenLesen, wetterText, type BerichtArt } from "@/lib/bericht";
import { berichtKontext, projektFotos } from "@/lib/bericht-daten";
import { formatDatum, formatDatumZeit } from "@/lib/format";
import { BerichtEntfernen } from "../bericht-entfernen";
import { BerichtFormular } from "../bericht-formular";

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
  if (!b) notFound();

  const daten = datenLesen(b.daten);
  const meiner = b.erstellt_von === k.nutzer.id;
  const bearbeitbar = b.status === "entwurf" && k.darfSchreiben && (meiner || k.istBuero);
  const zurueck = (
    <Link href={`/baustellen/${id}/berichte`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
      <ArrowLeftIcon className="size-4" /> Berichte
    </Link>
  );
  const titel = `${BERICHT_ART_NAMEN[b.art as BerichtArt] ?? b.art} · ${formatDatum(b.datum)}`;

  if (bearbeitbar) {
    const fotos = await projektFotos(k);
    return (
      <div className="flex flex-col gap-4">
        {zurueck}
        <h1 className="text-2xl font-semibold">{BERICHT_ART_NAMEN[b.art as BerichtArt] ?? b.art}</h1>
        <p className="-mt-2 text-muted-foreground">{k.projekt.name} · Entwurf</p>
        <BerichtFormular projektId={id} berichtId={b.id} startDatum={b.datum} start={daten} team={k.team} fotos={fotos} />
        <BerichtEntfernen projektId={id} berichtId={b.id} />
      </div>
    );
  }

  // Nur ansehen: abgeschlossene Berichte (und fremde Entwürfe)
  const [fotos, unterschrift] = await Promise.all([
    projektFotos(k, daten.fotos),
    b.unterschrift_pfad ? k.supabase.storage.from("berichtunterschriften").createSignedUrl(b.unterschrift_pfad, 3600) : Promise.resolve({ data: null }),
  ]);
  const reihenfolge = new Map(daten.fotos.map((f, i) => [f, i]));
  fotos.sort((x, y) => (reihenfolge.get(x.id) ?? 0) - (reihenfolge.get(y.id) ?? 0));
  const anwesend = daten.personal.map((uid) => k.team.find((t) => t.id === uid)?.name ?? k.namen.get(uid) ?? "Ehemaliger Kollege");
  const wetter = wetterText(daten.wetter, daten.temperatur);

  return (
    <div className="flex flex-col gap-5">
      {zurueck}
      <div>
        <h1 className="text-2xl font-semibold">{titel}</h1>
        <p className="text-muted-foreground">{k.projekt.name}</p>
        <p className="text-sm text-muted-foreground">
          {b.status === "entwurf" ? `Entwurf von ${k.wer(b.erstellt_von)}` : `Abgeschlossen am ${formatDatumZeit(b.abgeschlossen_am)} · ${k.wer(b.erstellt_von)}`}
        </p>
      </div>

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

      <dl className="flex flex-col gap-4">
        {wetter && <Zeile label="Wetter">{wetter}</Zeile>}
        <Zeile label="Anwesend">{anwesend.length ? anwesend.join(", ") : "–"}</Zeile>
        <Zeile label="Ausgeführte Arbeiten"><span className="whitespace-pre-line">{daten.arbeiten || "–"}</span></Zeile>
        {daten.besonderheiten && <Zeile label="Besonderheiten, Behinderungen, Mängel"><span className="whitespace-pre-line">{daten.besonderheiten}</span></Zeile>}
      </dl>

      {fotos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Fotos</h2>
          <ul className="grid grid-cols-2 gap-2">
            {fotos.map((f) => (
              <li key={f.id}>
                <a href={f.bildUrl ?? undefined} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border">
                  {f.vorschauUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.vorschauUrl} alt="Foto zum Bericht" className="size-full object-cover" />
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

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

function Zeile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-base">{children}</dd>
    </div>
  );
}
