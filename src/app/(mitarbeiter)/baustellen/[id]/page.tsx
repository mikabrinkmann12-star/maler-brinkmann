import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClockIcon, MailIcon, MapPinIcon, PencilIcon, PhoneIcon } from "lucide-react";
import { AdressKarte } from "@/components/adress-karte";
import { AnrufLink } from "@/components/anruf-link";
import { StatusPille } from "@/components/status-pille";
import { buttonVariants } from "@/components/ui/button";
import { formatDatum } from "@/lib/format";
import { appleMapsLink, adresseText, kontaktName, mailLink, mapsLink, telLink } from "@/lib/projekt";
import { projektKontext } from "@/lib/projekt-kontext";
import { Warteschlange } from "../../warteschlange";
import { AlteAnker } from "./alte-anker";
import { Angebote } from "./angebote";
import { ProjektArchivieren } from "./projekt-archivieren";
import { Rechnungen } from "./rechnungen";
import { Team } from "./team";

export const metadata: Metadata = { title: "Projekt" };

const KARTE = "flex flex-col gap-3 rounded-xl border bg-card p-4";

function MailKnopf({ email, name }: { email: string | null | undefined; name: string }) {
  const link = mailLink(email);
  if (!link) return null;
  return (
    <a href={link} aria-label={`E-Mail an ${name}`} className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
      <MailIcon />
    </a>
  );
}

// Reiter „Infos“ (die erste Seite eines Projekts): Projektname, Baustellenadresse, Kunde, Ansprechpartner, Team.
export default async function ProjektInfosSeite({ params }: PageProps<"/baustellen/[id]">) {
  const { id } = await params;
  const k = await projektKontext(id);
  const { supabase, nutzer, kollegen } = k;

  const [{ data: p }, { data: mitglieder }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        `id, name, beschreibung, baustelle_strasse, baustelle_plz, baustelle_ort, start_datum, end_datum,
         archiviert_am, buero_ansprechpartner_id, project_statuses(name, farbe),
         contacts(firmenname, anrede, vorname, nachname, ansprechpartner, telefon, mobil, email, strasse, plz, ort)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("project_members").select("user_id").eq("project_id", id),
  ]);
  if (!p) notFound();

  const team = (mitglieder ?? []).map((m) => kollegen.get(m.user_id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const anschrift = { strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort };
  const adresse = adresseText(anschrift);
  const kunde = p.contacts;
  const kundenName = kontaktName(kunde);
  const kundenAdresse = kunde ? { strasse: kunde.strasse, plz: kunde.plz, ort: kunde.ort } : {};
  const bueroKontakt = p.buero_ansprechpartner_id ? kollegen.get(p.buero_ansprechpartner_id) : undefined;
  const kundenNummer = kunde?.mobil || kunde?.telefon;

  return (
    <div className="flex flex-col gap-4">
      <AlteAnker projektId={p.id} />
      <Warteschlange userId={nutzer.id} />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {p.project_statuses ? <StatusPille name={p.project_statuses.name} farbe={p.project_statuses.farbe} /> : <span className="rounded-full border bg-card px-3 py-1">Kein Status</span>}
        <span className="rounded-full border bg-card px-3 py-1">
          {p.start_datum ? `${formatDatum(p.start_datum)}–${formatDatum(p.end_datum)}` : "Kein Start / Ende"}
        </span>
        {p.archiviert_am && <span className="rounded-full border bg-card px-3 py-1">archiviert</span>}
      </div>

      <section className={KARTE}>
        <div>
          <p className="text-sm text-muted-foreground">Projektname</p>
          <p className="text-lg font-semibold">{p.name}</p>
        </div>
        {p.beschreibung && (
          <div>
            <p className="text-sm text-muted-foreground">Projektbeschreibung</p>
            <p className="whitespace-pre-line">{p.beschreibung}</p>
          </div>
        )}
      </section>

      {adresse && (
        <AdressKarte
          titel="Baustellenadresse"
          text={adresse}
          googleLink={mapsLink(anschrift) ?? "#"}
          appleLink={appleMapsLink(anschrift) ?? "#"}
        />
      )}

      {kunde && (
        <section className={KARTE}>
          <div>
            <p className="text-sm text-muted-foreground">Kunde</p>
            <p className="text-lg font-semibold">{kundenName}</p>
          </div>
          <ul className="flex flex-col divide-y">
            {[
              { label: "Mobil", nummer: kunde.mobil },
              { label: "Telefon", nummer: kunde.telefon },
            ]
              .filter((t) => telLink(t.nummer))
              .map((t) => (
                <li key={t.label}>
                  <a href={telLink(t.nummer)!} className="flex min-h-12 items-center gap-3 py-1">
                    <PhoneIcon className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-muted-foreground">{t.label}</span>
                      <span className="block font-medium text-primary">{t.nummer}</span>
                    </span>
                  </a>
                </li>
              ))}
            {mailLink(kunde.email) && (
              <li>
                <a href={mailLink(kunde.email)!} className="flex min-h-12 items-center gap-3 py-1">
                  <MailIcon className="size-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-muted-foreground">E-Mail</span>
                    <span className="block truncate font-medium text-primary">{kunde.email}</span>
                  </span>
                </a>
              </li>
            )}
            {adresseText(kundenAdresse) && (
              <li>
                <a href={mapsLink(kundenAdresse) ?? "#"} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-3 py-1">
                  <MapPinIcon className="size-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-muted-foreground">Adresse</span>
                    <span className="block font-medium text-primary">{adresseText(kundenAdresse)}</span>
                  </span>
                </a>
              </li>
            )}
          </ul>
        </section>
      )}

      {(kunde || bueroKontakt) && (
        <section className={KARTE}>
          <p className="text-sm text-muted-foreground">Ansprechpartner</p>
          <ul className="flex flex-col divide-y">
            {kunde && (
              <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{kunde.ansprechpartner || kundenName}</span>
                  <span className="block truncate text-sm text-muted-foreground">Kunde{kunde.ansprechpartner ? ` · ${kundenName}` : ""}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <AnrufLink nummer={kundenNummer} name={kunde.ansprechpartner || kundenName} />
                  <MailKnopf email={kunde.email} name={kunde.ansprechpartner || kundenName} />
                </span>
              </li>
            )}
            {bueroKontakt && (
              <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{bueroKontakt.vorname} {bueroKontakt.nachname}</span>
                  <span className="block text-sm text-muted-foreground">Büro</span>
                </span>
                <AnrufLink nummer={bueroKontakt.telefon} name={bueroKontakt.vorname} />
              </li>
            )}
          </ul>
        </section>
      )}

      {k.istMitglied && !k.archiviert && (
        <Link href={`/zeiten/neu?projekt=${p.id}`} className={buttonVariants({ size: "touch", className: "w-full" })}>
          <ClockIcon /> Zeit eintragen
        </Link>
      )}

      <Team
        projektId={p.id}
        ichId={nutzer.id}
        darfHinzufuegen={k.istMitglied && !k.archiviert}
        darfEntfernen={k.istBuero}
        team={team}
        kollegen={[...kollegen.values()].filter((x) => x.id !== nutzer.id)}
      />

      {k.istBuero && <Angebote projektId={p.id} archiviert={k.archiviert} />}
      {k.istBuero && <Rechnungen projektId={p.id} />}

      {k.istBuero && (
        <div className="flex flex-col gap-3">
          <Link href={`/buero/projekte/${p.id}/bearbeiten`} className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}>
            <PencilIcon /> Projekt bearbeiten
          </Link>
          <ProjektArchivieren projektId={p.id} archiviert={k.archiviert} />
        </div>
      )}
    </div>
  );
}
