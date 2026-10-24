import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, DownloadIcon, FileCodeIcon, LockIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { RechnungPdfAnsicht } from "@/components/rechnung-pdf";
import { StatusPille } from "@/components/status-pille";
import { heuteIso } from "@/lib/datum";
import { faelligAm } from "@/lib/dashboard";
import { RECHNUNG_ANZEIGE_FARBEN, RECHNUNG_ANZEIGE_NAMEN, anzeigeStatus, faelligBeschreibung, offenerBetrag } from "@/lib/rechnung-liste";
import { RechnungNotiz } from "./rechnung-notiz";
import { requireBueroRecht } from "@/lib/auth";
import { auswahlAusSteuer } from "@/lib/angebot-schema";
import { formatBetrag, formatDatum, formatDatumZeit, formatZahl } from "@/lib/format";
import { aktuellerAnbieter, anbieterName, sevdeskEingerichtet, sevdeskFinalisieren } from "@/lib/buchhaltung";
import { firmaLaden } from "@/lib/firma-daten";
import { smtpKonfiguration } from "@/lib/env";
import { eRechnungFuer } from "@/lib/e-rechnung-daten";
import { lexwareEingerichtet, lexwareFinalisieren } from "@/lib/lexware";
import { mahnungMailVorschlag, rechnungMailVorschlag } from "@/lib/rechnung-mail";
import { RECHNUNGS_ART_NAMEN, istGutschriftArt, lexwareLink, rechnungBerechnen } from "@/lib/rechnung";
import { rechnungLaden } from "@/lib/rechnung-daten";
import { kopfStart } from "@/lib/rechnung-formular";
import { abgleichFaellig } from "@/lib/rechnung-abgleich";
import { AutoAbgleich } from "./auto-abgleich";
import { BuchhaltungLeiste } from "./buchhaltung-leiste";
import { MahnungKarte } from "./mahnung-karte";
import { mahnungsHinweis } from "@/lib/rechnung-einstellungen";
import { rechnungsEinstellungenLaden } from "@/lib/rechnung-einstellungen-daten";
import { PositionenEditor } from "./positionen-editor";
import { RechnungMailPanel, ZahlungKarte } from "./rechnung-aktionen";
import { RechnungKopf } from "./rechnung-kopf";

export const metadata: Metadata = { title: "Rechnung" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RechnungSeite({ params }: PageProps<"/buero/rechnungen/[id]">) {
  await requireBueroRecht("rechnungen");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await rechnungLaden(id);
  if (!detail) notFound();
  const { rechnung: r, bausteine, projekt, kunde, angebot, abschlaege, folgedokumente } = detail;
  const artName = RECHNUNGS_ART_NAMEN[r.art];
  // Gutschrift und Storno: Mengen und Preise positiv, die Summen negativ
  const vz = istGutschriftArt(r.art) ? -1 : 1;

  const gesperrt = r.status !== "entwurf" || r.archiviert;
  const rechnung = rechnungBerechnen(bausteine, { rabattProzent: r.rabattProzent, steuersatz: r.steuersatz, reverseCharge: r.reverseCharge });
  // Nach der Übertragung zählt, was Lexware zurückgemeldet hat
  const netto = r.netto ?? vz * rechnung.nettoNachRabatt;
  const brutto = r.brutto ?? vz * rechnung.brutto;
  const istEigenRechnung = r.anbieter === "eigen" || (r.status === "entwurf" && aktuellerAnbieter() === "eigen");
  const abweichung = !istEigenRechnung && r.netto !== null && Math.abs(r.netto - rechnung.nettoNachRabatt) > 0.01;
  const festgehangen = r.status === "wird_uebertragen";
  // Neue Rechnungen gehen an den eingestellten Anbieter (sevdesk im Hintergrund), bereits übertragene bleiben bei ihrem
  const anbieter = r.status === "entwurf" ? (aktuellerAnbieter() ?? "lexware") : r.anbieter;
  const name = anbieterName(anbieter);
  const istSevdesk = anbieter === "sevdesk";
  const istEigen = anbieter === "eigen";
  const eingerichtet = istEigen || (istSevdesk ? sevdeskEingerichtet() : lexwareEingerichtet());
  const finalisieren = istEigen || (istSevdesk ? sevdeskFinalisieren() : lexwareFinalisieren());
  const vorgaben = await rechnungsEinstellungenLaden();
  const mahnHinweise = Object.fromEntries([1, 2, 3].map((n) => [n, mahnungsHinweis(vorgaben, n) ?? ""]).filter(([, t]) => t));

  const heute = heuteIso();
  // E-Rechnung (nur eigene, fertige Rechnungen): Warnungen, was nach der Norm noch fehlt
  const eRechnung = istEigen && r.status === "uebertragen" ? await eRechnungFuer(r.id) : null;
  // Die Datei der Buchhaltung lässt sich als PDF direkt anzeigen (eine XRechnung ist XML und nur als Download da)
  const zeigePdf = Boolean(r.pdfPfad) && !r.pdfPfad!.endsWith(".xml");
  const autoAbgleich = eingerichtet && !istEigen && abgleichFaellig({ status: r.status, lexwareStatus: r.lexwareStatus, hatDatei: Boolean(r.pdfPfad), abgeglichenAm: r.abgeglichenAm });
  const sevdeskAktiv = istSevdesk && r.status === "uebertragen";
  // Versand und Mahnung per E-Mail gibt es bei sevdesk und bei den eigenen Rechnungen (dann über das SMTP-Postfach der App)
  const versandAktiv = sevdeskAktiv || (istEigen && r.status === "uebertragen");
  const firma = versandAktiv ? await firmaLaden() : null;
  const angaben = { rechnungsnummer: r.rechnungsnummer, betreff: r.betreff, brutto: r.brutto, rechnungsdatum: r.rechnungsdatum, zahlungszielTage: r.zahlungszielTage, firma: firma?.name ?? "" };
  const mahnSenden = versandAktiv && !istGutschriftArt(r.art)
    ? {
        an: r.versendetAn ?? kunde.email,
        vorschlaege: Object.fromEntries([1, 2, 3].map((n) => [n, mahnungMailVorschlag(angaben, n, vorgaben, heute)])),
        verlauf: detail.mahnungen.map((m) => ({ stufe: m.stufe, versendetAn: m.versendetAn, versendetAm: m.versendetAm })),
      }
    : undefined;
  const anzeige = anzeigeStatus(
    { status: r.status, lexwareStatus: r.lexwareStatus, rechnungsdatum: r.rechnungsdatum, zahlungszielTage: r.zahlungszielTage, mahnstufe: r.mahnstufe },
    heute,
  );
  const faellig = faelligAm(r.rechnungsdatum, r.zahlungszielTage);
  const offen = offenerBetrag({ brutto: brutto ?? 0 }, anzeige);
  const faelligText = anzeige === "bezahlt" || anzeige === "storniert" || anzeige === "entwurf" ? "–" : faelligBeschreibung(faellig, heute);
  const ueberfaellig = anzeige === "ueberfaellig" || anzeige === "angemahnt";
  const titel = `${r.betreff}${r.rechnungsnummer ? ` (${r.rechnungsnummer})` : ""}`;
  const abschnitt = "flex flex-col gap-3 border-t px-1 py-5";
  const ueberschrift = "px-3 text-[13px] font-semibold";

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/buero/rechnungen" aria-label="Zurück zu den Ausgangsrechnungen" className="flex size-9 items-center justify-center rounded-md border bg-white hover:bg-muted">
          <ArrowLeftIcon className="size-4" />
        </Link>
        <h1 className="text-lg font-semibold">{titel}</h1>
      </div>

      <section className="rounded-lg border bg-white px-5 py-4" aria-label="Rechnungsübersicht">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-2"><span className="font-semibold">Status:</span> <StatusPille name={RECHNUNG_ANZEIGE_NAMEN[anzeige]} farbe={RECHNUNG_ANZEIGE_FARBEN[anzeige]} /></span>
            <span><span className="font-semibold">Offene Forderung:</span> {offen > 0 ? formatBetrag(offen) : anzeige === "bezahlt" ? formatBetrag(0) : "–"}</span>
            <span className={cn(ueberfaellig && "text-destructive")}><span className="font-semibold text-foreground">Fällig:</span> {faelligText}</span>
          </div>
          <div className="flex items-center gap-1">
            {r.pdfPfad && (
              <>
                <a href={`/buero/rechnungen/${r.id}/pdf?download=1`} aria-label="Rechnung herunterladen" title="Rechnung herunterladen" className="flex size-8 items-center justify-center rounded-md hover:bg-muted"><DownloadIcon className="size-4" /></a>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-6 border-t py-5 text-[13px] md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="mb-1 font-semibold">Allgemein</h2>
            <p>{artName}</p>
            <p>{r.betreff}</p>
            {r.bezugId && r.bezugNummer && <p>Bezug: <Link href={`/buero/rechnungen/${r.bezugId}`} className="font-medium hover:underline">{r.bezugNummer}</Link></p>}
            {r.rechnungsnummer && <p>{r.rechnungsnummer}</p>}
            <p>{formatDatum(r.rechnungsdatum)}</p>
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="mb-1 font-semibold">Empfänger</h2>
            {kunde.anschrift.length ? kunde.anschrift.map((z, i) => <p key={i}>{z}</p>) : <p>{kunde.name}</p>}
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="mb-1 font-semibold">Gesamtbetrag</h2>
            <p className="flex max-w-56 justify-between gap-6"><span>Netto</span><span className="tabular-nums">{formatBetrag(netto)}</span></p>
            {rechnung.reverseCharge ? (
              <p className="max-w-56 text-muted-foreground">Reverse-Charge (§ 13b UStG)</p>
            ) : (
              <p className="flex max-w-56 justify-between gap-6"><span>{rechnung.steuersatz} % USt</span><span className="tabular-nums">{formatBetrag(r.brutto !== null && r.netto !== null ? r.brutto - r.netto : vz * rechnung.ust)}</span></p>
            )}
            <p className="flex max-w-56 justify-between gap-6 border-t pt-0.5 font-semibold"><span>Brutto</span><span className="tabular-nums">{formatBetrag(brutto)}</span></p>
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="mb-1 font-semibold">Zahlungsbedingungen</h2>
            <p>Zahlungsziel: {r.zahlungszielTage} {r.zahlungszielTage === 1 ? "Tag" : "Tage"}</p>
            {r.skontoProzent != null && r.skontoTage != null && <p>Skonto: {formatZahl(r.skontoProzent)} % bei Zahlung in {r.skontoTage} {r.skontoTage === 1 ? "Tag" : "Tagen"}</p>}
            <p className="text-muted-foreground">Leistungszeitraum {formatDatum(r.leistungVon)} bis {formatDatum(r.leistungBis)}</p>
          </div>
        </div>

        {r.art === "schluss" && (
          <div className={abschnitt}>
            <h2 className={ueberschrift}>Abzug der Abschlagsrechnungen</h2>
            {abschlaege.length ? (
              <ul className="flex flex-col gap-1 px-3 text-[13px]">
                {abschlaege.map((a) => (
                  <li key={a.id} className="flex max-w-xl justify-between gap-6">
                    <span><Link href={`/buero/rechnungen/${a.id}`} className="font-medium hover:underline">{a.nummer}</Link> vom {formatDatum(a.datum)}</span>
                    <span className="tabular-nums">{formatBetrag(a.brutto)} brutto</span>
                  </li>
                ))}
                <li className="flex max-w-xl justify-between gap-6 border-t pt-1 font-semibold"><span>{r.status === "uebertragen" ? "Noch zu zahlen" : "Gesamt brutto abzüglich Abschläge"}</span><span className="tabular-nums">{formatBetrag(r.status === "uebertragen" ? (r.brutto ?? 0) : rechnung.brutto - abschlaege.reduce((s, a) => s + a.brutto, 0))}</span></li>
              </ul>
            ) : (
              <p className="px-3 text-[13px] text-muted-foreground">Zu diesem Angebot gibt es noch keine fertige Abschlagsrechnung. Beim Fertigstellen werden alle fertigen Abschläge des Angebots abgezogen.</p>
            )}
          </div>
        )}

        {folgedokumente.length > 0 && (
          <div className={abschnitt}>
            <h2 className={ueberschrift}>Gutschriften und Stornos</h2>
            <ul className="flex flex-col gap-1 px-3 text-[13px]">
              {folgedokumente.map((f) => (
                <li key={f.id} className="flex max-w-xl justify-between gap-6">
                  <span>{RECHNUNGS_ART_NAMEN[f.art]} <Link href={`/buero/rechnungen/${f.id}`} className="font-medium hover:underline">{f.nummer}</Link> vom {formatDatum(f.datum)}</span>
                  <span className="tabular-nums">{formatBetrag(f.brutto)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={abschnitt}>
          <h2 className={ueberschrift}>Zahlungen</h2>
          {anzeige === "bezahlt" ? (
            <p className="px-3 text-[13px]">Diese Rechnung ist bezahlt ({formatBetrag(brutto)}){r.bezahltAm ? ` am ${formatDatum(r.bezahltAm)}` : ""}.{!istEigen && ` Die einzelnen Zahlungen stehen in ${name}.`}</p>
          ) : r.status === "uebertragen" ? (
            <p className="px-3 text-[13px] text-muted-foreground">{istSevdesk || istEigen ? "Noch keine Zahlung gebucht. Unten kannst du sie als bezahlt buchen." : "Noch keine Zahlung gemeldet. Zahlungen trägst du in Lexware ein; danach „Abgleichen“."}</p>
          ) : (
            <p className="px-3 text-[13px] text-muted-foreground">Zahlungen gibt es erst, wenn die Rechnung fertiggestellt ist.</p>
          )}
        </div>

        <div className={abschnitt}>
          <h2 className={ueberschrift}>Abzüge</h2>
          {rechnung.rabattProzent > 0 ? (
            <p className="px-3 text-[13px]">Rabatt {formatZahl(rechnung.rabattProzent)} % = {formatBetrag(-rechnung.rabatt)} (auf die Nettosumme {formatBetrag(rechnung.netto)})</p>
          ) : (
            <p className="px-3 text-[13px] text-muted-foreground">Keine Abzüge. Einen Rabatt stellst du im Rechnungsentwurf unten ein.</p>
          )}
        </div>

        <div className={abschnitt}>
          <h2 className={ueberschrift}>Notiz</h2>
          <RechnungNotiz key={r.notiz} rechnungId={r.id} start={r.notiz} />
        </div>
      </section>

      {zeigePdf && <RechnungPdfAnsicht rechnungId={r.id} titel={titel} version={r.abgeglichenAm ?? r.pdfPfad ?? ""} />}

      <p className="text-[13px] text-muted-foreground">
        Projekt{" "}
        <Link href={`/buero/projekte/${projekt.id}`} className="font-medium text-foreground hover:underline">{projekt.projektnummer} · {projekt.name}</Link>
        {" · "}Kunde{" "}
        <Link href={`/buero/kontakte/${kunde.id}`} className="font-medium text-foreground hover:underline">{kunde.name}</Link>
        {kunde.kundennummer && ` (${kunde.kundennummer})`}
        {angebot && <> · aus Angebot <Link href={`/buero/angebote/${angebot.id}`} className="font-medium text-foreground hover:underline">{angebot.betreff}</Link></>}
        {r.uebertragenAm && (istEigen ? <> · Fertiggestellt am {formatDatumZeit(r.uebertragenAm)}</> : <> · An {name} übertragen am {formatDatumZeit(r.uebertragenAm)}{r.abgeglichenAm && <>, zuletzt abgeglichen am {formatDatumZeit(r.abgeglichenAm)}</>}</>)}
      </p>

      {autoAbgleich && <AutoAbgleich rechnungId={r.id} name={name} />}

      <BuchhaltungLeiste
        rechnungId={r.id}
        status={r.status}
        name={name}
        eigen={istEigen}
        artName={artName}
        zugang={istSevdesk ? "SEVDESK_API_TOKEN" : "LEXWARE_API_KEY"}
        lexwareLink={!istSevdesk && r.lexwareId ? lexwareLink(r.lexwareId) : null}
        hatPdf={Boolean(r.pdfPfad)}
        eingerichtet={eingerichtet}
        finalisieren={finalisieren}
        festgehangen={festgehangen}
      />

      {eRechnung && (
        <section className="flex flex-col gap-2 rounded-xl border p-4" aria-label="E-Rechnung">
          <h2 className="flex items-center gap-2 text-base font-semibold"><FileCodeIcon className="size-4" /> E-Rechnung</h2>
          <p className="text-sm text-muted-foreground">
            Strukturierte Rechnung nach EN 16931 ({eRechnung.profil === "xrechnung" ? "XRechnung für Behörden, der Kunde hat eine Leitweg-ID" : "ZUGFeRD/Factur-X"}). Ab 2028 muss jeder Betrieb sie ausstellen können. Der Aufbau ist nach der Norm gebaut,
            aber noch nicht mit dem amtlichen Prüfprogramm geprüft. Das PDF mit eingebettetem XML ist kein zertifiziertes PDF/A-3.
          </p>
          {eRechnung.warnungen.length > 0 && (
            <ul className="list-disc rounded-lg bg-amber-50 px-6 py-2 text-sm text-amber-900">
              {eRechnung.warnungen.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <a href={`/buero/rechnungen/${r.id}/e-rechnung?format=xml`} className={buttonVariants({ variant: "outline" })}><DownloadIcon /> {eRechnung.profil === "xrechnung" ? "XRechnung (XML)" : "E-Rechnung (XML)"}</a>
            {r.pdfPfad && <a href={`/buero/rechnungen/${r.id}/e-rechnung?format=pdf`} className={buttonVariants({ variant: "outline" })}><DownloadIcon /> PDF mit E-Rechnung (ZUGFeRD)</a>}
          </div>
        </section>
      )}

      {versandAktiv && r.lexwareStatus !== "voided" && r.lexwareStatus !== "draft" && (
        <RechnungMailPanel
          rechnungId={r.id}
          bereit={istEigen ? smtpKonfiguration() !== null : eingerichtet}
          start={{ an: r.versendetAn ?? kunde.email, ...rechnungMailVorschlag(angaben) }}
          zuletzt={r.versendetAm && r.versendetAn ? { am: r.versendetAm, an: r.versendetAn } : null}
        />
      )}

      {(sevdeskAktiv || (istEigen && r.status === "uebertragen")) && (
        <ZahlungKarte
          rechnungId={r.id}
          brutto={brutto}
          heute={heute}
          kannBuchen={r.lexwareStatus === "open"}
          kannStornieren={(sevdeskAktiv || (istEigen && !istGutschriftArt(r.art))) && (r.lexwareStatus === "open" || r.lexwareStatus === "paid")}
          kannGutschrift={istEigen && !istGutschriftArt(r.art) && r.lexwareStatus !== "voided"}
          kannZuruecknehmen={istEigen && r.lexwareStatus === "paid"}
          bezahltAm={r.bezahltAm}
        />
      )}

      {r.status === "uebertragen" && r.lexwareStatus === "open" && (
        <MahnungKarte rechnungId={r.id} stufe={r.mahnstufe} angemahntAm={r.angemahntAm} hinweise={mahnHinweise} senden={mahnSenden} />
      )}

      {gesperrt && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <LockIcon className="size-4 shrink-0" />
          {r.archiviert ? "Diese Rechnung ist archiviert." : istEigen ? "Diese Rechnung ist fertiggestellt und gesperrt (Nummer und PDF sind festgeschrieben)." : `Diese Rechnung ist an ${name} übertragen und gesperrt (Nummer und PDF stammen von ${name}).`}
        </p>
      )}

      <RechnungKopf
        key={`kopf:${r.betreff}|${r.rechnungsdatum}|${r.leistungVon}|${r.leistungBis}|${r.zahlungszielTage}|${r.skontoProzent}|${r.skontoTage}|${r.steuersatz}|${r.reverseCharge}|${r.rabattProzent}|${r.einleitung}|${r.schlusstext}`}
        rechnungId={r.id}
        gesperrt={gesperrt}
        start={kopfStart({
          betreff: r.betreff, rechnungsdatum: r.rechnungsdatum, leistungVon: r.leistungVon, leistungBis: r.leistungBis,
          zahlungszielTage: r.zahlungszielTage, skontoProzent: r.skontoProzent, skontoTage: r.skontoTage,
          steuer: auswahlAusSteuer(r.steuersatz, r.reverseCharge), rabattProzent: r.rabattProzent, einleitung: r.einleitung, schlusstext: r.schlusstext,
        })}
      />

      <section aria-labelledby="pos-titel" className="flex flex-col gap-3">
        <h2 id="pos-titel" className="text-lg font-semibold">Positionen</h2>
        <PositionenEditor rechnungId={r.id} projektId={projekt.id} bausteine={bausteine} gesperrt={gesperrt} />
      </section>

      {r.netto !== null && abweichung && (
        <p className="text-sm text-destructive">Laut {name}: netto {formatBetrag(netto)}{brutto !== null && <>, brutto {formatBetrag(brutto)}</>} – weicht von der App ab, bitte prüfen!</p>
      )}
    </div>
  );
}
