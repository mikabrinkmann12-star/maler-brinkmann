import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ClockIcon, ConstructionIcon, ImageIcon, NavigationIcon, StickyNoteIcon } from "lucide-react";
import { AnrufLink } from "@/components/anruf-link";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { vorschauPfad } from "@/lib/bild";
import { formatDatum, formatDatumZeit } from "@/lib/format";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { adresseText, kontaktName, mapsLink } from "@/lib/projekt";
import { istBueroRolle } from "@/lib/rollen";
import { createClient } from "@/lib/supabase/server";
import { Warteschlange } from "../../warteschlange";
import { Fotos, type FotoAnzeige } from "./fotos";
import { Notizen, type NotizAnzeige } from "./notizen";
import { Team } from "./team";

export const metadata: Metadata = { title: "Baustelle" };

const SCHNELL = buttonVariants({ variant: "outline", size: "touch", className: "h-16 flex-col gap-1 px-1 text-sm" });

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

  const [{ data: mitglieder }, kollegen, { data: notizDaten }, { data: fotoDaten }] = await Promise.all([
    supabase.from("project_members").select("user_id").eq("project_id", id),
    kollegenLaden(),
    supabase.from("project_notes").select("id, text, erstellt_von, created_at")
      .eq("project_id", id).is("archiviert_am", null).order("created_at", { ascending: false }),
    supabase.from("project_photos").select("id, storage_pfad, kategorie, kommentar, erstellt_von, created_at")
      .eq("project_id", id).is("archiviert_am", null).order("created_at", { ascending: false }),
  ]);
  const team = (mitglieder ?? []).map((m) => kollegen.get(m.user_id)).filter((k): k is NonNullable<typeof k> => Boolean(k));
  const istMitglied = team.some((t) => t.id === nutzer.id);
  const istBuero = istBueroRolle(nutzer.rolle);
  const darfInhalte = (istMitglied || istBuero) && !p.archiviert_am;
  const wer = (uid: string | null) => {
    if (uid === nutzer.id) return "Du";
    const k = uid ? kollegen.get(uid) : undefined;
    return k ? `${k.vorname} ${k.nachname}`.trim() : "Ehemaliger Kollege";
  };
  const darfLoeschen = (uid: string | null) => istBuero || (uid === nutzer.id && istMitglied);

  // Fotos liegen im privaten Speicher: zeitlich begrenzte Adressen (1 Stunde) erzeugen
  const pfade = (fotoDaten ?? []).flatMap((f) => [f.storage_pfad, vorschauPfad(f.storage_pfad)]);
  const { data: adressen } = pfade.length
    ? await supabase.storage.from("projektfotos").createSignedUrls(pfade, 60 * 60)
    : { data: [] };
  const adresse = new Map((adressen ?? []).filter((a) => a.signedUrl && !a.error).map((a) => [a.path, a.signedUrl]));
  const fotos: FotoAnzeige[] = (fotoDaten ?? []).map((f) => ({
    id: f.id,
    kategorie: f.kategorie,
    kommentar: f.kommentar ?? "",
    bildUrl: adresse.get(f.storage_pfad) ?? null,
    vorschauUrl: adresse.get(vorschauPfad(f.storage_pfad)) ?? adresse.get(f.storage_pfad) ?? null,
    wer: wer(f.erstellt_von),
    wann: formatDatumZeit(f.created_at),
    darfLoeschen: darfLoeschen(f.erstellt_von),
  }));
  const notizen: NotizAnzeige[] = (notizDaten ?? []).map((n) => ({
    id: n.id,
    text: n.text,
    wer: wer(n.erstellt_von),
    wann: formatDatumZeit(n.created_at),
    darfLoeschen: darfLoeschen(n.erstellt_von),
  }));
  const anschrift = { strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort };
  const navi = mapsLink(anschrift);
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
        {adresseText(anschrift) && <p className="text-lg">{adresseText(anschrift)}</p>}
        {navi && (
          <a href={navi} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "touch", className: "w-full" })}>
            <NavigationIcon /> Navigation starten
          </a>
        )}
        {p.beschreibung && <p className="whitespace-pre-line text-muted-foreground">{p.beschreibung}</p>}
      </div>

      <Warteschlange userId={nutzer.id} />

      {/* Schnellzugriff: ein Tipp zur gewünschten Stelle */}
      {darfInhalte && (
        <nav aria-label="Auf dieser Baustelle" className="grid grid-cols-3 gap-2">
          {istMitglied && (
            <Link href={`/zeiten/neu?projekt=${p.id}`} className={SCHNELL}>
              <ClockIcon /> Zeit
            </Link>
          )}
          <a href="#fotos" className={SCHNELL}><ImageIcon /> Fotos</a>
          <a href="#notizen" className={SCHNELL}><StickyNoteIcon /> Notizen</a>
        </nav>
      )}

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
        darfEntfernen={istBuero}
        team={team}
        kollegen={[...kollegen.values()].filter((k) => k.id !== nutzer.id)}
      />

      <Fotos projektId={p.id} ichId={nutzer.id} darfHochladen={darfInhalte} fotos={fotos} />
      <Notizen projektId={p.id} ichId={nutzer.id} darfSchreiben={darfInhalte} notizen={notizen} />

      <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        <ConstructionIcon className="mt-0.5 size-5 shrink-0" />
        <p>Material und Aufmaß kommen im nächsten Schritt (1.6).</p>
      </div>
    </div>
  );
}
