import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { requireBueroRecht } from "@/lib/auth";
import { eingangsrechnungLaden, projekteFuerZuweisung } from "@/lib/eingangsrechnung-daten";
import { formatDatum } from "@/lib/format";
import { RechnungFormular } from "./rechnung-formular";

export const metadata: Metadata = { title: "Eingangsrechnung" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERKANNT: Record<string, { text: string; farbe: string }> = {
  "e-rechnung": { text: "Automatisch aus der E-Rechnung gelesen. Die Daten stammen aus der Datei des Lieferanten.", farbe: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  "pdf-text": { text: "Aus dem Text des PDFs gelesen. Das ist ein Vorschlag: bitte Nummer, Datum und Beträge mit der Rechnung rechts vergleichen.", farbe: "border-amber-300 bg-amber-50 text-amber-900" },
  ki: { text: "Von der KI gelesen. Das ist ein Vorschlag und kann Fehler enthalten: bitte Lieferant, Nummer, Datum, Beträge und IBAN mit der Rechnung rechts vergleichen.", farbe: "border-sky-300 bg-sky-50 text-sky-900" },
  keine: { text: "Aus der Datei konnte nichts gelesen werden (z. B. ein Foto). Bitte die Felder von Hand eintragen.", farbe: "border-amber-300 bg-amber-50 text-amber-900" },
};

export default async function EingangsrechnungSeite({ params }: PageProps<"/buero/eingangsrechnungen/[id]">) {
  await requireBueroRecht("eingangsrechnungen");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [d, projekte] = await Promise.all([eingangsrechnungLaden(id), projekteFuerZuweisung()]);
  if (!d) notFound();
  const z = d.zeile;
  // Ein Projekt, das nicht mehr in der Liste der aktiven steht, bleibt trotzdem auswählbar
  const projektListe = z.projectId && !projekte.some((p) => p.id === z.projectId) ? [{ id: z.projectId, text: z.projektText || "Projekt" }, ...projekte] : projekte;
  const hinweis = d.erkanntAus ? ERKANNT[d.erkanntAus] : null;
  const istBild = d.mime.startsWith("image/");
  const istPdf = d.mime === "application/pdf";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/buero/eingangsrechnungen" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" /> Eingangsrechnungen
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{z.lieferant || "Eingangsrechnung"}{z.rechnungsnummer ? ` · ${z.rechnungsnummer}` : ""}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {z.quelle === "email" ? `Per E-Mail eingegangen${d.absender ? ` von ${d.absender}` : ""}` : `Hochgeladen von ${z.hochgeladenVon || "–"}`} am {formatDatum(z.hochgeladenAm.slice(0, 10))} · {z.dateiname}
          {d.archiviert && " · Archiviert"}
        </p>
      </div>

      {hinweis && z.zuPruefen && <p className={`rounded-md border px-3 py-2 text-[13px] ${hinweis.farbe}`}>{hinweis.text}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="rounded-lg border bg-white p-4">
          <RechnungFormular
            key={`${z.id}-${z.zuPruefen}-${z.zahlstatus}`}
            projekte={projektListe}
            start={{
              id: z.id,
              lieferant: z.lieferant,
              rechnungsnummer: z.rechnungsnummer,
              rechnungsdatum: z.rechnungsdatum,
              faelligAm: z.faelligAm,
              netto: z.netto,
              brutto: z.brutto,
              iban: d.iban,
              zahlstatus: z.zahlstatus,
              bezahltAm: d.bezahltAm,
              projectId: z.projectId,
              bereich: z.bereich,
              notiz: d.notiz,
              zuPruefen: z.zuPruefen,
              archiviert: d.archiviert,
            }}
          />
        </div>

        <div className="flex min-h-96 flex-col gap-2">
          {d.dateiUrl ? (
            <>
              <div className="flex items-center justify-end gap-3 text-xs">
                <a href={d.dateiUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                  <ExternalLinkIcon className="size-3.5" /> In neuem Tab öffnen
                </a>
                <a href={d.dateiUrl} download={z.dateiname} className="inline-flex items-center gap-1 underline underline-offset-2">
                  <DownloadIcon className="size-3.5" /> Herunterladen
                </a>
              </div>
              {istPdf ? (
                <iframe title="Rechnung" src={d.dateiUrl} className="h-[75vh] min-h-96 w-full rounded-lg border bg-white" />
              ) : istBild ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.dateiUrl} alt="Rechnung" className="max-h-[75vh] w-full rounded-lg border bg-white object-contain" />
              ) : (
                <p className="rounded-lg border bg-white p-6 text-[13px] text-muted-foreground">Diese Datei ist eine E-Rechnung (XML). Die Daten links wurden daraus gelesen. Zum Ansehen die Datei herunterladen.</p>
              )}
            </>
          ) : (
            <p className="rounded-lg border bg-white p-6 text-[13px] text-muted-foreground">Die Datei kann gerade nicht angezeigt werden.</p>
          )}
        </div>
      </div>
    </div>
  );
}
