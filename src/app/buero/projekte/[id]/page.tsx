import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  CalculatorIcon,
  ClockIcon,
  FileTextIcon,
  FolderOpenIcon,
  MessageCircleIcon,
  NavigationIcon,
  PackageIcon,
  PencilIcon,
  ReceiptTextIcon,
  RulerIcon,
  StickyNoteIcon,
} from "lucide-react";
import { cn } from "cn";
import { AnrufLink } from "@/components/anruf-link";
import { buttonVariants } from "@/components/ui/button";
import { requireBueroRecht } from "@/lib/auth";
import { angeboteLaden } from "@/lib/angebot-daten";
import { ungelesenKarte, zaehlerText } from "@/lib/chat";
import { formatBetrag, formatStunden } from "@/lib/format";
import { bearbeitetText, personKreis, zeitraumText } from "@/lib/listen-anzeige";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { projektZahlenLaden } from "@/lib/projekt-detail-daten";
import { adresseText, kontaktName, mapsLink } from "@/lib/projekt";
import { createClient } from "@/lib/supabase/server";
import { Angebote } from "@/app/(mitarbeiter)/baustellen/[id]/angebote";
import { Projektliste } from "@/app/(mitarbeiter)/baustellen/[id]/arbeitsanweisung";
import { ProjektArchivieren } from "@/app/(mitarbeiter)/baustellen/[id]/projekt-archivieren";
import { Rechnungen } from "@/app/(mitarbeiter)/baustellen/[id]/rechnungen";
import { Team } from "@/app/(mitarbeiter)/baustellen/[id]/team";
import { StatusWahl } from "../status-wahl";

export const metadata: Metadata = { title: "Projekt" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type KachelProps = { href: string; icon: typeof ClockIcon; titel: string; wert: string; unter?: string; abzeichen?: string };

/** Kachel wie in Plancraft: Symbol, Titel, große Zahl, kleine Zeile darunter; führt zum Bereich. */
function Kachel({ href, icon: Icon, titel, wert, unter, abzeichen }: KachelProps) {
  return (
    <Link href={href} className="relative flex flex-col gap-1 rounded-lg border bg-white p-3 transition-colors hover:bg-muted/50">
      <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Icon className="size-4" /> {titel}
      </span>
      <span className="text-xl font-semibold tabular-nums">{wert}</span>
      {unter && <span className="truncate text-xs text-muted-foreground">{unter}</span>}
      {abzeichen && (
        <span className="absolute top-2.5 right-2.5 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs leading-5 font-semibold text-white">{abzeichen}</span>
      )}
    </Link>
  );
}

export default async function ProjektSeite({ params }: PageProps<"/buero/projekte/[id]">) {
  const nutzer = await requireBueroRecht("projekte_ansehen");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: p } = await supabase
    .from("projects")
    .select(
      `id, name, projektnummer, beschreibung, baustelle_strasse, baustelle_plz, baustelle_ort, start_datum, end_datum, archiviert_am,
       updated_at, bearbeitet_von, buero_ansprechpartner_id, status_id, project_statuses(id, name, farbe),
       contacts(id, kundennummer, firmenname, anrede, vorname, nachname, ansprechpartner, telefon, mobil, email)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const [{ data: mitglieder }, kollegen, zahlen, angebote, { data: statusDaten }, { data: ungelesenDaten }] = await Promise.all([
    supabase.from("project_members").select("user_id").eq("project_id", id),
    kollegenLaden(),
    projektZahlenLaden(id),
    angeboteLaden({ projektId: id }),
    supabase.from("project_statuses").select("id, name, farbe, sortierung").eq("aktiv", true).order("sortierung"),
    supabase.rpc("chat_ungelesen"),
  ]);
  const team = (mitglieder ?? []).map((m) => kollegen.get(m.user_id)).filter((k): k is NonNullable<typeof k> => Boolean(k));
  const chatNeu = ungelesenKarte(ungelesenDaten).get(id) ?? 0;
  const anschrift = { strasse: p.baustelle_strasse, plz: p.baustelle_plz, ort: p.baustelle_ort };
  const navi = mapsLink(anschrift);
  const kunde = p.contacts;
  const bueroKontakt = p.buero_ansprechpartner_id ? kollegen.get(p.buero_ansprechpartner_id) : undefined;
  const bearbeiter = p.bearbeitet_von ? kollegen.get(p.bearbeitet_von) : undefined;
  const archiviert = Boolean(p.archiviert_am);
  const offeneAngebote = angebote.zeilen.filter((a) => a.status === "versendet");
  const offenNetto = Math.round(offeneAngebote.reduce((s, a) => s + a.netto * 100, 0)) / 100;
  const hand = `/baustellen/${id}`;

  const kacheln: KachelProps[] = [
    { href: "#angebote", icon: FileTextIcon, titel: "Angebote", wert: String(angebote.zeilen.length), unter: offeneAngebote.length ? `${offeneAngebote.length} offen · ${formatBetrag(offenNetto)} netto` : undefined },
    { href: "#rechnungen", icon: ReceiptTextIcon, titel: "Rechnungen", wert: String(zahlen.rechnungen.anzahl), unter: zahlen.rechnungen.offenBrutto > 0 ? `${formatBetrag(zahlen.rechnungen.offenBrutto)} offen` : undefined },
    { href: `/buero/zeiten?projekt=${id}&von=2000-01-01&bis=2099-12-31`, icon: ClockIcon, titel: "Zeiten", wert: `${formatStunden(zahlen.stunden)}`.replace(" Std", ""), unter: "Std gesamt" },
    { href: `${hand}/chat`, icon: MessageCircleIcon, titel: "Chat", wert: chatNeu > 0 ? `${chatNeu} neu` : "Öffnen", abzeichen: chatNeu > 0 ? zaehlerText(chatNeu) : undefined },
    { href: `${hand}/berichte`, icon: FileTextIcon, titel: "Berichte", wert: String(zahlen.berichte) },
    { href: `${hand}#ablage`, icon: FolderOpenIcon, titel: "Ablage", wert: String(zahlen.fotos + zahlen.dateien), unter: `${zahlen.fotos} Fotos · ${zahlen.dateien} Dateien` },
    { href: `/buero/projekte/${id}/nachkalkulation`, icon: CalculatorIcon, titel: "Nachkalkulation", wert: "Öffnen", unter: "Soll/Ist, Kosten" },
    { href: `${hand}/aufmass`, icon: RulerIcon, titel: "Aufmaß", wert: String(zahlen.aufmassZeilen), unter: "Zeilen" },
    { href: `${hand}#notizen`, icon: StickyNoteIcon, titel: "Notizen", wert: String(zahlen.notizen) },
    { href: `${hand}#material`, icon: PackageIcon, titel: "Material gemeldet", wert: String(zahlen.materialOffen), unter: "offen" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/buero/projekte" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" /> Projekte
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl leading-tight font-semibold">{p.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              {p.projektnummer && <span>{p.projektnummer}</span>}
              <StatusWahl projektId={p.id} aktuell={p.project_statuses} alle={(statusDaten ?? []).map((s) => ({ id: s.id, name: s.name, farbe: s.farbe }))} />
              {archiviert && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Archiviert</span>}
              {(p.start_datum || p.end_datum) && <span>{zeitraumText(p.start_datum, p.end_datum)}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!archiviert && (
              <Link href={`/buero/angebote/neu?projekt=${p.id}`} className={buttonVariants({ variant: "outline", className: "h-8 px-3 text-[13px]" })}>
                <FileTextIcon className="size-3.5" /> Neues Angebot
              </Link>
            )}
            <Link href={`/buero/projekte/${p.id}/bearbeiten`} className={buttonVariants({ className: "h-8 px-3 text-[13px]" })}>
              <PencilIcon className="size-3.5" /> Bearbeiten
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-lg border bg-white p-4 text-[13px]">
            <h2 className="text-[15px] font-semibold">Projektdetails</h2>
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">Baustelle</dt>
                <dd>
                  {adresseText(anschrift) || "–"}
                  {navi && (
                    <a href={navi} target="_blank" rel="noopener noreferrer" className="mt-1 flex w-fit items-center gap-1 text-xs underline underline-offset-2">
                      <NavigationIcon className="size-3" /> Route in Google Maps
                    </a>
                  )}
                </dd>
              </div>
              {kunde && (
                <div>
                  <dt className="text-xs text-muted-foreground">Kunde</dt>
                  <dd>
                    <Link href={`/buero/kontakte/${kunde.id}`} className="font-medium underline-offset-2 hover:underline">{kontaktName(kunde)}</Link>
                    {kunde.kundennummer && <span className="text-muted-foreground"> · {kunde.kundennummer}</span>}
                    {kunde.ansprechpartner && <span className="block text-muted-foreground">Ansprechpartner: {kunde.ansprechpartner}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-3">
                      <AnrufLink nummer={kunde.mobil || kunde.telefon} name={kontaktName(kunde)} />
                      {kunde.email && <a href={`mailto:${kunde.email}`} className="text-xs underline underline-offset-2">{kunde.email}</a>}
                    </span>
                  </dd>
                </div>
              )}
              {bueroKontakt && (
                <div>
                  <dt className="text-xs text-muted-foreground">Ansprechpartner im Büro</dt>
                  <dd>{bueroKontakt.vorname} {bueroKontakt.nachname}</dd>
                </div>
              )}
              {p.beschreibung && (
                <div>
                  <dt className="text-xs text-muted-foreground">Beschreibung</dt>
                  <dd className="whitespace-pre-line">{p.beschreibung}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Zuletzt bearbeitet</dt>
                <dd>{bearbeitetText(p.updated_at)}{bearbeiter ? ` · ${bearbeiter.vorname} ${bearbeiter.nachname}` : ""}</dd>
              </div>
            </dl>
          </section>

          <section className="flex flex-col gap-3 rounded-lg border bg-white p-4">
            <h2 className="text-[15px] font-semibold">Mitarbeiter</h2>
            {team.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {team.map((t) => {
                  const k = personKreis(`${t.vorname} ${t.nachname}`);
                  return (
                    <li key={t.id} title={`${t.vorname} ${t.nachname}`} className="flex size-7 items-center justify-center rounded-full text-[11px] font-semibold text-neutral-800" style={{ backgroundColor: k.farbe }}>
                      {k.initialen}
                    </li>
                  );
                })}
              </ul>
            )}
            <Team projektId={p.id} ichId={nutzer.id} darfHinzufuegen={!archiviert} darfEntfernen team={team} kollegen={[...kollegen.values()].filter((k) => k.id !== nutzer.id)} />
          </section>

          <ProjektArchivieren projektId={p.id} archiviert={archiviert} />
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          <nav aria-label="Bereiche dieses Projekts" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {kacheln.map((k) => <Kachel key={k.titel} {...k} />)}
          </nav>

          <div id="angebote" className="scroll-mt-4"><Angebote projektId={p.id} archiviert={archiviert} /></div>
          <div id="rechnungen" className="scroll-mt-4"><Rechnungen projektId={p.id} /></div>
          <Projektliste projektId={p.id} art="arbeitsanweisung" istBuero archiviert={archiviert} />
          <Projektliste projektId={p.id} art="materialliste" istBuero archiviert={archiviert} />

          <p className="text-xs text-muted-foreground">
            Fotos, Dateien, Notizen und Materialmeldungen findest du in der <Link href={hand} className={cn("underline underline-offset-2")}>Baustellen-Ansicht</Link> (so sehen es auch die Mitarbeiter am Handy).
          </p>
        </div>
      </div>

    </div>
  );
}
