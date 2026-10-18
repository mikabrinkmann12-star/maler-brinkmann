import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { auswahlAusSteuer } from "@/lib/angebot-schema";
import { formatBetrag, formatDatum, formatDatumZeit, formatZahl } from "@/lib/format";
import { lexwareEingerichtet, lexwareFinalisieren } from "@/lib/lexware";
import { lexwareLink, rechnungBerechnen } from "@/lib/rechnung";
import { rechnungLaden } from "@/lib/rechnung-daten";
import { kopfStart } from "@/lib/rechnung-formular";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { RechnungStatusBadge } from "../status-badge";
import { LexwareLeiste } from "./lexware-leiste";
import { MahnungKarte } from "./mahnung-karte";
import { mahnungsHinweis } from "@/lib/rechnung-einstellungen";
import { rechnungsEinstellungenLaden } from "@/lib/rechnung-einstellungen-daten";
import { PositionenEditor } from "./positionen-editor";
import { RechnungKopf } from "./rechnung-kopf";

export const metadata: Metadata = { title: "Rechnung" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RechnungSeite({ params }: PageProps<"/buero/rechnungen/[id]">) {
  await requireRole(BUERO_ROLLEN);
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
  const vorgaben = await rechnungsEinstellungenLaden();
  const mahnHinweise = Object.fromEntries([1, 2, 3].map((n) => [n, mahnungsHinweis(vorgaben, n) ?? ""]).filter(([, t]) => t));

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Link href="/buero/rechnungen" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Ausgangsrechnungen
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{r.rechnungsnummer ? `Rechnung ${r.rechnungsnummer}` : "Rechnung"}: {r.betreff}</h1>
          <RechnungStatusBadge status={r.status} lexwareStatus={r.lexwareStatus} />
        </div>
        <p className="text-sm text-muted-foreground">
          Projekt{" "}
          <Link href={`/buero/projekte/${projekt.id}`} className="font-medium text-foreground hover:underline">{projekt.projektnummer} · {projekt.name}</Link>
          {" · "}Kunde{" "}
          <Link href={`/buero/kontakte/${kunde.id}`} className="font-medium text-foreground hover:underline">{kunde.name}</Link>
          {kunde.kundennummer && ` (${kunde.kundennummer})`}
          {angebot && <> · aus Angebot <Link href={`/buero/angebote/${angebot.id}`} className="font-medium text-foreground hover:underline">{angebot.betreff}</Link></>}
        </p>
        {r.uebertragenAm && (
          <p className="text-sm text-muted-foreground">
            An Lexware übertragen am {formatDatumZeit(r.uebertragenAm)}
            {r.abgeglichenAm && <>, zuletzt abgeglichen am {formatDatumZeit(r.abgeglichenAm)}</>}.
          </p>
        )}
      </div>

      <LexwareLeiste
        rechnungId={r.id}
        status={r.status}
        lexwareLink={r.lexwareId ? lexwareLink(r.lexwareId) : null}
        hatPdf={Boolean(r.pdfPfad)}
        eingerichtet={lexwareEingerichtet()}
        finalisieren={lexwareFinalisieren()}
        festgehangen={festgehangen}
      />

      {r.status === "uebertragen" && r.lexwareStatus === "open" && (
        <MahnungKarte rechnungId={r.id} stufe={r.mahnstufe} angemahntAm={r.angemahntAm} hinweise={mahnHinweise} />
      )}

      {gesperrt && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <LockIcon className="size-4 shrink-0" />
          {r.archiviert ? "Diese Rechnung ist archiviert." : "Diese Rechnung ist an Lexware übertragen und gesperrt (Nummer und PDF stammen von Lexware)."}
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

      <section aria-labelledby="summen-titel" className="ml-auto flex w-full max-w-md flex-col gap-1 rounded-xl border p-4">
        <h2 id="summen-titel" className="sr-only">Summen</h2>
        <p className="flex justify-between gap-4"><span className="text-muted-foreground">Nettosumme</span><span className="tabular-nums">{formatBetrag(rechnung.netto)}</span></p>
        {rechnung.rabattProzent > 0 && (
          <>
            <p className="flex justify-between gap-4"><span className="text-muted-foreground">Rabatt {formatZahl(rechnung.rabattProzent)} %</span><span className="tabular-nums">{formatBetrag(-rechnung.rabatt)}</span></p>
            <p className="flex justify-between gap-4"><span className="text-muted-foreground">Netto nach Rabatt</span><span className="tabular-nums">{formatBetrag(rechnung.nettoNachRabatt)}</span></p>
          </>
        )}
        {rechnung.reverseCharge ? (
          <p className="mt-2 text-sm text-muted-foreground">Reverse-Charge (§ 13b UStG): keine Umsatzsteuer, den Hinweis setzt Lexware.</p>
        ) : rechnung.steuersatz > 0 ? (
          <>
            <p className="flex justify-between gap-4"><span className="text-muted-foreground">Umsatzsteuer {rechnung.steuersatz} %</span><span className="tabular-nums">{formatBetrag(rechnung.ust)}</span></p>
            <p className="flex justify-between gap-4 border-t pt-2 text-lg font-semibold"><span>Gesamtsumme brutto</span><span className="tabular-nums">{formatBetrag(rechnung.brutto)}</span></p>
          </>
        ) : null}
        {r.netto !== null && (
          <p className={`mt-2 border-t pt-2 text-sm ${abweichung ? "text-destructive" : "text-muted-foreground"}`}>
            Laut Lexware: netto {formatBetrag(netto)}{brutto !== null && <>, brutto {formatBetrag(brutto)}</>}
            {abweichung && " – weicht von der App ab, bitte in Lexware prüfen!"}
          </p>
        )}
      </section>

      <p className="text-sm text-muted-foreground">Leistungszeitraum {formatDatum(r.leistungVon)} bis {formatDatum(r.leistungBis)}, Rechnungsdatum {formatDatum(r.rechnungsdatum)}.</p>
    </div>
  );
}
