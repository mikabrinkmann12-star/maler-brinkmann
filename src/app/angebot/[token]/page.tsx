import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";
import { angebotBerechnen } from "@/lib/angebot";
import { angebotLaden } from "@/lib/angebot-daten";
import { freigabeFinden } from "@/lib/angebot-freigabe-daten";
import { firmaLaden } from "@/lib/firma-daten";
import { formatBetrag, formatDatum } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { GeoeffnetMelder } from "./geoeffnet-melder";

// Öffentliche Online-Ansicht eines Angebots (Link aus der E-Mail). Kein Login; der Schlüssel im Link ist die Berechtigung.
export const metadata: Metadata = { title: "Ihr Angebot", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

function Ungueltig() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Dieser Link ist nicht mehr gültig</h1>
      <p className="text-muted-foreground">Der Link zum Angebot ist abgelaufen oder wurde zurückgezogen. Bitte melden Sie sich bei uns, wir schicken Ihnen das Angebot gern noch einmal.</p>
    </main>
  );
}

export default async function AngebotOnline({ params }: PageProps<"/angebot/[token]">) {
  const { token } = await params;
  const db = createAdminClient();
  const freigabe = await freigabeFinden(db, token);
  if (!freigabe) return <Ungueltig />;
  const detail = await angebotLaden(freigabe.quoteId, db);
  if (!detail || detail.angebot.archiviert) return <Ungueltig />;
  const { angebot: a, bausteine, kunde } = detail;

  const firma = await firmaLaden(db);
  const rechnung = angebotBerechnen(bausteine, { rabattProzent: a.rabattProzent, steuersatz: a.steuersatz, reverseCharge: a.reverseCharge });
  let logoUrl: string | null = null;
  if (firma.logo) {
    const { data } = await db.storage.from("firmenlogo").createSignedUrl(firma.logo, 3600);
    logoUrl = data?.signedUrl ?? null;
  }
  const kontakt = [firma.telefon && `Telefon ${firma.telefon}`, firma.email].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-5 p-4 sm:p-8">
      <GeoeffnetMelder token={token} />
      <header className="flex flex-col items-center gap-2 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signierte Adresse aus dem privaten Speicher
          <img src={logoUrl} alt={firma.name} className="max-h-16 max-w-52 object-contain" />
        ) : (
          <p className="text-xl font-bold">{firma.name}</p>
        )}
      </header>

      <section className="flex flex-col gap-3 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm text-muted-foreground">Angebot{kunde?.name ? ` für ${kunde.name}` : ""}</p>
          <h1 className="text-2xl font-semibold">{a.betreff}</h1>
        </div>
        {a.status === "abgelehnt" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Dieses Angebot ist als abgelehnt vermerkt.</p>}
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Datum</dt><dd className="font-medium">{formatDatum(a.datum)}</dd></div>
          {a.gueltigBis && <div><dt className="text-muted-foreground">Gültig bis</dt><dd className="font-medium">{formatDatum(a.gueltigBis)}</dd></div>}
          <div>
            <dt className="text-muted-foreground">{rechnung.reverseCharge || rechnung.steuersatz === 0 ? "Gesamtbetrag" : "Gesamtbetrag brutto"}</dt>
            <dd className="text-lg font-semibold">{formatBetrag(rechnung.brutto)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/angebot/${token}/pdf?download=1`}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-[oklch(0.6_0.135_153)] px-5 text-base font-semibold text-white hover:opacity-90"
          >
            <DownloadIcon className="size-5" /> PDF herunterladen
          </a>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <iframe title="Angebot als PDF" src={`/angebot/${token}/pdf`} className="h-[75vh] min-h-96 w-full" />
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">Wird das PDF hier nicht angezeigt (z. B. am Handy), laden Sie es bitte mit dem grünen Knopf herunter.</p>
      </section>

      <footer className="pb-6 text-center text-sm text-muted-foreground">
        <p>Bei Fragen melden Sie sich gern bei uns.{kontakt && <><br />{kontakt}</>}</p>
        <p className="mt-1">{[firma.name, firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</p>
      </footer>
    </main>
  );
}
