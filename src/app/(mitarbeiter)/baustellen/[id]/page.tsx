import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ConstructionIcon, NavigationIcon } from "lucide-react";
import { AnrufLink } from "@/components/anruf-link";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDatum } from "@/lib/format";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { adresseText, kontaktName, mapsLink } from "@/lib/projekt";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { Team } from "./team";

export const metadata: Metadata = { title: "Baustelle" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BaustelleSeite({ params }: { params: Promise<{ id: string }> }) {
  const nutzer = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  // RLS: Mitarbeiter sehen nur eigene Projekte, Büro/Admin alle
  const { data: p } = await supabase
    .from("projects")
    .select(
      `id, name, beschreibung, baustelle_strasse, baustelle_plz, baustelle_ort, start_datum, end_datum,
       archiviert_am, buero_ansprechpartner_id, project_statuses(name, farbe),
       contacts(firmenname, anrede, vorname, nachname, ansprechpartner, telefon, mobil)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const [{ data: mitglieder }, kollegen] = await Promise.all([
    supabase.from("project_members").select("user_id").eq("project_id", id),
    kollegenLaden(),
  ]);
  const team = (mitglieder ?? []).map((m) => kollegen.get(m.user_id)).filter((k): k is NonNullable<typeof k> => Boolean(k));
  const istMitglied = team.some((t) => t.id === nutzer.id);
  const adresse = { strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort };
  const navi = mapsLink(adresse);
  const kunde = p.contacts;
  const bueroKontakt = p.buero_ansprechpartner_id ? kollegen.get(p.buero_ansprechpartner_id) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/baustellen" className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Meine Baustellen
      </Link>

      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-3 rounded-full" style={{ backgroundColor: p.project_statuses?.farbe ?? "#94a3b8" }} />
          {p.project_statuses?.name}
          {p.start_datum && ` · ${formatDatum(p.start_datum)}–${formatDatum(p.end_datum)}`}
          {p.archiviert_am && " · archiviert"}
        </p>
        <h1 className="text-2xl font-semibold leading-tight">{p.name}</h1>
        {adresseText(adresse) && <p className="text-lg">{adresseText(adresse)}</p>}
        {navi && (
          <a href={navi} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "touch", className: "w-full" })}>
            <NavigationIcon /> Navigation starten
          </a>
        )}
        {p.beschreibung && <p className="whitespace-pre-line text-muted-foreground">{p.beschreibung}</p>}
      </div>

      {(kunde || bueroKontakt) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Ansprechpartner</h2>
          <ul className="flex flex-col divide-y rounded-xl border">
            {kunde && (
              <li className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="block">{kunde.ansprechpartner || kontaktName(kunde)}</span>
                  <span className="text-sm text-muted-foreground">Kunde{kunde.ansprechpartner ? ` · ${kontaktName(kunde)}` : ""}</span>
                </span>
                <AnrufLink nummer={kunde.mobil || kunde.telefon} name={kontaktName(kunde)} />
              </li>
            )}
            {bueroKontakt && (
              <li className="flex items-center justify-between gap-3 px-4 py-2">
                <span>
                  <span className="block">{bueroKontakt.vorname} {bueroKontakt.nachname}</span>
                  <span className="text-sm text-muted-foreground">Büro</span>
                </span>
                <AnrufLink nummer={bueroKontakt.telefon} name={bueroKontakt.vorname} />
              </li>
            )}
          </ul>
        </section>
      )}

      <Team
        projektId={p.id}
        ichId={nutzer.id}
        darfHinzufuegen={istMitglied && !p.archiviert_am}
        darfEntfernen={istBueroRolle(nutzer.rolle)}
        team={team}
        kollegen={[...kollegen.values()].filter((k) => k.id !== nutzer.id)}
      />

      <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <ConstructionIcon className="mt-0.5 size-5 shrink-0" />
        <p>Notizen, Fotos, Material und Aufmaß kommen in den nächsten Schritten (1.5 und 1.6).</p>
      </div>
    </div>
  );
}
