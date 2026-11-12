import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, DownloadIcon, FileSpreadsheetIcon, FolderArchiveIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ladeRechte, requireBueroRecht } from "@/lib/auth";
import { heuteIso } from "@/lib/datum";
import { formatBetrag } from "@/lib/format";
import { RECHNUNGS_ART_NAMEN } from "@/lib/rechnung";
import { rechtOk } from "@/lib/rechte";
import { datevEinstellungenLaden, exportRechnungenLaden } from "@/lib/steuerberater-daten";
import { ZIP_TEIL_GROESSE, inTeile, vorigerMonat, zeitraumLesen } from "@/lib/steuerberater-export";
import { DatevFormular } from "./datev-formular";

export const metadata: Metadata = { title: "Export für den Steuerberater" };

export default async function SteuerberaterSeite({ searchParams }: PageProps<"/buero/rechnungen/steuerberater">) {
  const nutzer = await requireBueroRecht("rechnungen");
  const sp = await searchParams;
  const heute = heuteIso();
  const zeitraum = zeitraumLesen(typeof sp.von === "string" ? sp.von : null, typeof sp.bis === "string" ? sp.bis : null) ?? vorigerMonat(heute);

  const [zeilen, datev, rechte] = await Promise.all([exportRechnungenLaden(zeitraum), datevEinstellungenLaden(), ladeRechte()]);
  const mitDatei = zeilen.filter((z) => z.pdfPfad && !z.pdfPfad.endsWith(".xml"));
  const teile = inTeile(mitDatei, ZIP_TEIL_GROESSE).length;
  const darfAendern = nutzer.rolle === "admin" || rechtOk(rechte, "einstellungen_firma");
  const summe = zeilen.reduce((s, z) => ({ netto: s.netto + z.netto, brutto: s.brutto + z.brutto }), { netto: 0, brutto: 0 });
  const abfrage = `von=${zeitraum.von}&bis=${zeitraum.bis}`;
  const btn = buttonVariants({ variant: "outline" });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/buero/rechnungen" aria-label="Zurück zu den Ausgangsrechnungen" className="flex size-9 items-center justify-center rounded-md border bg-white hover:bg-muted"><ArrowLeftIcon className="size-4" /></Link>
        <div>
          <h1 className="text-xl font-semibold">Export für den Steuerberater</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Alle fertigen Rechnungen, Gutschriften und Stornos eines Zeitraums: Liste für Excel, Buchungsstapel für DATEV und alle Rechnungsdateien.</p>
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">Von<input type="date" name="von" defaultValue={zeitraum.von} className="h-11 rounded-lg border border-input bg-background px-3" /></label>
        <label className="flex flex-col gap-1 text-sm">Bis<input type="date" name="bis" defaultValue={zeitraum.bis} className="h-11 rounded-lg border border-input bg-background px-3" /></label>
        <button type="submit" className={buttonVariants({ variant: "default" })}>Zeitraum anzeigen</button>
        <Link href={`/buero/rechnungen/steuerberater?${new URLSearchParams(vorigerMonat(heute)).toString()}`} className={buttonVariants({ variant: "ghost" })}>Voriger Monat</Link>
        <Link href={`/buero/rechnungen/steuerberater?von=${heute.slice(0, 4)}-01-01&bis=${heute}`} className={buttonVariants({ variant: "ghost" })}>Dieses Jahr</Link>
      </form>

      <section className="flex flex-col gap-3 rounded-xl border bg-white p-4" aria-label="Downloads">
        <h2 className="text-base font-semibold">{zeilen.length} {zeilen.length === 1 ? "Beleg" : "Belege"}, netto {formatBetrag(summe.netto)}, brutto {formatBetrag(summe.brutto)}</h2>
        {zeilen.length === 0 ? (
          <p className="text-sm text-muted-foreground">In diesem Zeitraum gibt es keine fertigen Rechnungen.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <a href={`/buero/rechnungen/steuerberater/export?typ=journal&${abfrage}`} className={btn}><FileSpreadsheetIcon /> Rechnungsjournal (CSV für Excel)</a>
              <a href={`/buero/rechnungen/steuerberater/export?typ=datev&${abfrage}`} className={btn}><DownloadIcon /> DATEV-Buchungsstapel</a>
              <a href={`/buero/rechnungen/steuerberater/export?typ=debitoren&${abfrage}`} className={btn}><DownloadIcon /> DATEV-Kundenkonten</a>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {teile === 0 ? <span className="text-sm text-muted-foreground">Keine Rechnungsdateien zum Herunterladen.</span> : Array.from({ length: teile }, (_, i) => (
                <a key={i} href={`/buero/rechnungen/steuerberater/export?typ=zip&teil=${i + 1}&${abfrage}`} className={btn}><FolderArchiveIcon /> Rechnungsdateien{teile > 1 ? `, Teil ${i + 1} von ${teile}` : ""}</a>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Die Dateien gehen in Teilen zu je {ZIP_TEIL_GROESSE} Rechnungen herunter (Grenze des Servers). Bei Rechnungen der App liegt das XML der E-Rechnung dabei.</p>
          </div>
        )}
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Der DATEV-Buchungsstapel ist ein Vorschlag nach dem bekannten Aufbau (Format 510) und noch nicht mit DATEV getestet. Konten und Nummern unten stellt der Steuerberater ein; er prüft die Datei beim ersten Import. Jede Rechnung wird auf das Kundenkonto des Kunden gebucht (ab 10001), dazu gibt es die Kundenliste „DATEV-Kundenkonten“ zum Einlesen.
        </p>
      </section>

      {zeilen.length > 0 && (
        <section className="overflow-x-auto rounded-xl border bg-white" aria-label="Vorschau">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground"><tr><th className="px-3 py-2">Nummer</th><th className="px-3 py-2">Art</th><th className="px-3 py-2">Datum</th><th className="px-3 py-2">Kunde</th><th className="px-3 py-2 text-right">Netto</th><th className="px-3 py-2 text-right">Brutto</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>
              {zeilen.slice(0, 200).map((z) => (
                <tr key={z.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2 font-medium"><Link href={`/buero/rechnungen/${z.id}`} className="hover:underline">{z.nummer}</Link></td>
                  <td className="px-3 py-2">{RECHNUNGS_ART_NAMEN[z.art]}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{z.datum.split("-").reverse().join(".")}</td>
                  <td className="px-3 py-2">{z.kunde}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBetrag(z.netto)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBetrag(z.brutto)}</td>
                  <td className="px-3 py-2">{z.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {zeilen.length > 200 && <p className="px-3 py-2 text-xs text-muted-foreground">Vorschau: die ersten 200 von {zeilen.length}. Die Downloads enthalten alle.</p>}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-xl border bg-white p-4" aria-label="DATEV-Einstellungen">
        <h2 className="text-base font-semibold">Konten für den DATEV-Export</h2>
        <DatevFormular start={datev} darfAendern={darfAendern} />
      </section>
    </div>
  );
}
