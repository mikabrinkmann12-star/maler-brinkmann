import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { angebotBerechnen } from "@/lib/angebot";
import { auswahlAusSteuer } from "@/lib/angebot-schema";
import { angebotLaden } from "@/lib/angebot-daten";
import { angebotEinstellungenLaden } from "@/lib/firma-daten";
import { formatBetrag, formatZahl } from "@/lib/format";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "../status-badge";
import { AbschlussFormular } from "./abschluss-formular";
import { AktionenLeiste } from "./aktionen-leiste";
import { BausteineEditor } from "./bausteine-editor";
import { KopfFormular } from "./kopf-formular";

export const metadata: Metadata = { title: "Angebot" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AngebotSeite({ params }: PageProps<"/buero/angebote/[id]">) {
  await requireRole(BUERO_ROLLEN);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const detail = await angebotLaden(id);
  if (!detail) notFound();
  const { angebot: a, bausteine, projekt, kunde } = detail;

  const gesperrt = a.status !== "entwurf" || a.archiviert;
  const rechnung = angebotBerechnen(bausteine, { rabattProzent: a.rabattProzent, steuersatz: a.steuersatz, reverseCharge: a.reverseCharge });
  const vorgaben = await angebotEinstellungenLaden();

  // Bilder liegen in einem privaten Speicher: für die Anzeige kurz gültige Adressen holen
  const bildUrls: Record<string, string> = {};
  const bilder = bausteine.filter((b) => b.typ === "bild" && b.bildPfad);
  if (bilder.length) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("angebotsbilder").createSignedUrls(bilder.map((b) => b.bildPfad as string), 3600);
    for (const b of bilder) {
      const treffer = data?.find((d) => d.path === b.bildPfad);
      if (treffer?.signedUrl) bildUrls[b.id] = treffer.signedUrl;
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Link href="/buero/angebote" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Angebote
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{a.betreff}</h1>
          <StatusBadge status={a.status} />
          {a.archiviert && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">Archiviert</span>}
        </div>
        <p className="text-sm text-muted-foreground">
          Projekt{" "}
          <Link href={`/baustellen/${projekt.id}`} className="font-medium text-foreground hover:underline">
            {projekt.projektnummer} · {projekt.name}
          </Link>
          {kunde && <> · Kunde <Link href={`/buero/kontakte/${kunde.id}`} className="font-medium text-foreground hover:underline">{kunde.name}</Link>{kunde.kundennummer && ` (${kunde.kundennummer})`}</>}
        </p>
      </div>

      <AktionenLeiste angebotId={a.id} status={a.status} archiviert={a.archiviert} />

      {gesperrt && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <LockIcon className="size-4 shrink-0" />
          {a.archiviert
            ? "Dieses Angebot ist archiviert. Stelle es wieder her, um es zu bearbeiten."
            : "Dieses Angebot ist gesperrt, weil es nicht mehr im Status „Entwurf“ ist. Zum Bearbeiten setzt du es zurück auf Entwurf."}
        </p>
      )}

      <KopfFormular
        key={`kopf:${a.betreff}|${a.datum}|${a.leistungsort}|${a.empfaenger}|${a.einleitung}`}
        angebotId={a.id}
        start={{ betreff: a.betreff, leistungsort: a.leistungsort, datum: a.datum, empfaenger: a.empfaenger, einleitung: a.einleitung }}
        gesperrt={gesperrt}
      />

      <section aria-labelledby="bausteine-titel" className="flex flex-col gap-3">
        <h2 id="bausteine-titel" className="text-lg font-semibold">Positionen</h2>
        <BausteineEditor angebotId={a.id} zeilen={rechnung.zeilen} bildUrls={bildUrls} gesperrt={gesperrt} />
      </section>

      <section aria-labelledby="summen-titel" className="ml-auto flex w-full max-w-md flex-col gap-1 rounded-xl border p-4">
        <h2 id="summen-titel" className="sr-only">Summen</h2>
        <SummenZeile label="Nettosumme" wert={rechnung.netto} />
        {rechnung.rabattProzent > 0 && (
          <>
            <SummenZeile label={`Rabatt ${formatZahl(rechnung.rabattProzent)} %`} wert={-rechnung.rabatt} />
            <SummenZeile label="Netto nach Rabatt" wert={rechnung.nettoNachRabatt} />
          </>
        )}
        {rechnung.reverseCharge ? (
          <p className="mt-2 text-sm text-muted-foreground">{vorgaben.reverse_charge_text}</p>
        ) : rechnung.steuersatz > 0 ? (
          <>
            <SummenZeile label={`Umsatzsteuer ${rechnung.steuersatz} %`} wert={rechnung.ust} />
            <SummenZeile label="Gesamtsumme brutto" wert={rechnung.brutto} stark />
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Ohne Umsatzsteuer (0 %).</p>
        )}
      </section>

      <AbschlussFormular
        key={`abschluss:${a.schlusstext}|${a.steuersatz}|${a.reverseCharge}|${a.rabattProzent}`}
        angebotId={a.id}
        start={{ schlusstext: a.schlusstext, steuer: auswahlAusSteuer(a.steuersatz, a.reverseCharge), rabatt: a.rabattProzent }}
        gesperrt={gesperrt}
      />
    </div>
  );
}

function SummenZeile({ label, wert, stark }: { label: string; wert: number; stark?: boolean }) {
  return (
    <p className={`flex justify-between gap-4 ${stark ? "border-t pt-2 text-lg font-semibold" : ""}`}>
      <span className={stark ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{formatBetrag(wert)}</span>
    </p>
  );
}
