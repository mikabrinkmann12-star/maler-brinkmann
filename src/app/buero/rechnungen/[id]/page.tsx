import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, DownloadIcon, EyeIcon, LockIcon } from "lucide-react";
import { cn } from "cn";
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
import { lexwareEingerichtet, lexwareFinalisieren } from "@/lib/lexware";
import { mahnungMailVorschlag, rechnungMailVorschlag } from "@/lib/rechnung-mail";
import { lexwareLink, rechnungBerechnen } from "@/lib/rechnung";
import { rechnungLaden } from "@/lib/rechnung-daten";
import { kopfStart } from "@/lib/rechnung-formular";
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
  const { rechnung: r, bausteine, projekt, kunde, angebot } = detail;

  const gesperrt = r.status !== "entwurf" || r.archiviert;
  const rechnung = rechnungBerechnen(bausteine, { rabattProzent: r.rabattProzent, steuersatz: r.steuersatz, reverseCharge: r.reverseCharge });
  // Nach der Übertragung zählt, was Lexware zurückgemeldet hat
  const netto = r.netto ?? rechnung.nettoNachRabatt;
  const brutto = r.brutto ?? rechnung.brutto;
  const abweichung = r.netto !== null && Math.abs(r.netto - rechnung.nettoNachRabatt) > 0.01;
  const festgehangen = r.status === "wird_uebertragen";
  // Neue Rechnungen gehen an den eingestellten Anbieter (sevdesk im Hintergrund), bereits übertragene bleiben bei ihrem
  const anbieter = r.status === "entwurf" ? (aktuellerAnbieter() ?? "sevdesk") : r.anbieter;
  const name = anbieterName(anbieter);
  const istSevdesk = anbieter === "sevdesk";
  const eingerichtet = istSevdesk ? sevdeskEingerichtet() : lexwareEingerichtet();
  const finalisieren = istSevdesk ? sevdeskFinalisieren() : lexwareFinalisieren();
  const vorgaben = await rechnungsEinstellungenLaden();
  const mahnHinweise = Object.fromEntries([1, 2, 3].map((n) => [n, mahnungsHinweis(vorgaben, n) ?? ""]).filter(([, t]) => t));

  const heute = heuteIso();
  const sevdeskAktiv = istSevdesk && r.status === "uebertragen";
  const firma = sevdeskAktiv ? await firmaLaden() : null;
  const angaben = { rechnungsnummer: r.rechnungsnummer, betreff: r.betreff, brutto: r.brutto, rechnungsdatum: r.rechnungsdatum, zahlungszielTage: r.zahlungszielTage, firma: firma?.name ?? "" };
  const mahnSenden = sevdeskAktiv
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
                <a href={`/buero/rechnungen/${r.id}/pdf`} target="_blank" rel="noreferrer" aria-label="Rechnung ansehen" title="Rechnung ansehen" className="flex size-8 items-center justify-center rounded-md hover:bg-muted"><EyeIcon className="size-4" /></a>
                <a href={`/buero/rechnungen/${r.id}/pdf?download=1`} aria-label="Rechnung herunterladen" title="Rechnung herunterladen" className="flex size-8 items-center justify-center rounded-md hover:bg-muted"><DownloadIcon className="size-4" /></a>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-6 border-t py-5 text-[13px] md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="mb-1 font-semibold">Allgemein</h2>
            <p>Rechnung</p>
            <p>{r.betreff}</p>
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
              <p className="flex max-w-56 justify-between gap-6"><span>{rechnung.steuersatz} % USt</span><span className="tabular-nums">{formatBetrag(r.brutto !== null && r.netto !== null ? r.brutto - r.netto : rechnung.ust)}</span></p>
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

        <div className={abschnitt}>
          <h2 className={ueberschrift}>Zahlungen</h2>
          {anzeige === "bezahlt" ? (
            <p className="px-3 text-[13px]">Diese Rechnung ist bezahlt ({formatBetrag(brutto)}). Die einzelnen Zahlungen stehen in {name}.</p>
          ) : r.status === "uebertragen" ? (
            <p className="px-3 text-[13px] text-muted-foreground">{istSevdesk ? "Noch keine Zahlung gebucht. Unten kannst du sie als bezahlt buchen." : "Noch keine Zahlung gemeldet. Zahlungen trägst du in Lexware ein; danach „Abgleichen“."}</p>
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

      <p className="text-[13px] text-muted-foreground">
        Projekt{" "}
        <Link href={`/buero/projekte/${projekt.id}`} className="font-medium text-foreground hover:underline">{projekt.projektnummer} · {projekt.name}</Link>
        {" · "}Kunde{" "}
        <Link href={`/buero/kontakte/${kunde.id}`} className="font-medium text-foreground hover:underline">{kunde.name}</Link>
        {kunde.kundennummer && ` (${kunde.kundennummer})`}
        {angebot && <> · aus Angebot <Link href={`/buero/angebote/${angebot.id}`} className="font-medium text-foreground hover:underline">{angebot.betreff}</Link></>}
        {r.uebertragenAm && <> · An {name} übertragen am {formatDatumZeit(r.uebertragenAm)}{r.abgeglichenAm && <>, zuletzt abgeglichen am {formatDatumZeit(r.abgeglichenAm)}</>}</>}
      </p>

      <BuchhaltungLeiste
        rechnungId={r.id}
        status={r.status}
        name={name}
        zugang={istSevdesk ? "SEVDESK_API_TOKEN" : "LEXWARE_API_KEY"}
        lexwareLink={!istSevdesk && r.lexwareId ? lexwareLink(r.lexwareId) : null}
        hatPdf={Boolean(r.pdfPfad)}
        eingerichtet={eingerichtet}
        finalisieren={finalisieren}
        festgehangen={festgehangen}
      />

      {sevdeskAktiv && r.lexwareStatus !== "voided" && r.lexwareStatus !== "draft" && (
        <RechnungMailPanel
          rechnungId={r.id}
          bereit={eingerichtet}
          start={{ an: r.versendetAn ?? kunde.email, ...rechnungMailVorschlag(angaben) }}
          zuletzt={r.versendetAm && r.versendetAn ? { am: r.versendetAm, an: r.versendetAn } : null}
        />
      )}

      {sevdeskAktiv && (
        <ZahlungKarte
          rechnungId={r.id}
          brutto={brutto}
          heute={heute}
          kannBuchen={r.lexwareStatus === "open"}
          kannStornieren={r.lexwareStatus === "open" || r.lexwareStatus === "paid"}
          bezahltAm={r.bezahltAm}
        />
      )}

      {r.status === "uebertragen" && r.lexwareStatus === "open" && (
        <MahnungKarte rechnungId={r.id} stufe={r.mahnstufe} angemahntAm={r.angemahntAm} hinweise={mahnHinweise} senden={mahnSenden} />
      )}

      {gesperrt && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <LockIcon className="size-4 shrink-0" />
          {r.archiviert ? "Diese Rechnung ist archiviert." : `Diese Rechnung ist an ${name} übertragen und gesperrt (Nummer und PDF stammen von ${name}).`}
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
