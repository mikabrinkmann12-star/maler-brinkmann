import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDatumLang, formatDatumZeit, formatStunden } from "@/lib/format";
import { kollegenLaden } from "@/lib/mitarbeiter-daten";
import { createClient } from "@/lib/supabase/server";
import { ZEIT_ART_NAMEN, uhrzeitKurz, zeitNochAenderbar } from "@/lib/zeiten";
import { zeitFormularDaten } from "@/lib/zeiten-daten";
import { Warteschlange } from "../../warteschlange";
import { ZeitFormular } from "../zeit-formular";

export const metadata: Metadata = { title: "Zeit" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ZeitSeite({ params }: PageProps<"/zeiten/[id]">) {
  const nutzer = await requireUser();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("time_entries")
    .select("id, datum, von, bis, pause_min, stunden, art, beschreibung, user_id, erstellt_von, bearbeitet_von, project_id, archiviert_am, created_at, updated_at, projects(name)")
    .eq("id", id)
    .maybeSingle();
  // Mitarbeiter-Ansicht: nur eigene oder selbst für Kollegen eingetragene Zeiten
  if (!t || t.archiviert_am || (t.user_id !== nutzer.id && t.erstellt_von !== nutzer.id)) notFound();

  const [daten, kollegen] = await Promise.all([zeitFormularDaten(nutzer), kollegenLaden()]);
  const name = (uid: string | null) => {
    if (!uid) return "–";
    if (uid === nutzer.id) return "dir";
    const k = kollegen.get(uid);
    return k ? `${k.vorname} ${k.nachname}`.trim() : "einem ehemaligen Kollegen";
  };

  const istMeine = t.user_id === nutzer.id;
  const imZeitraum = daten.darfAlles || zeitNochAenderbar(t.datum, daten.heute, daten.einstellungen.kulanzTage);
  const artErlaubt = daten.darfAlles || daten.einstellungen.erlaubteArten.includes(t.art);
  const aenderbar = istMeine && imZeitraum && artErlaubt;
  const grund = !istMeine
    ? `Diesen Eintrag kann nur ${name(t.user_id)} selbst oder das Büro ändern.`
    : !imZeitraum
      ? "Dieser Tag ist abgeschlossen (Sperrfrist). Änderungen bitte im Büro melden."
      : !artErlaubt
        ? `„${ZEIT_ART_NAMEN[t.art]}“ kann nur das Büro ändern.`
        : null;

  // Baustelle des Eintrags auch dann anbieten, wenn sie inzwischen archiviert ist
  if (aenderbar && t.project_id && !daten.projekte.some((p) => p.id === t.project_id)) {
    daten.projekte.push({ id: t.project_id, name: t.projects?.name ?? "Baustelle", ort: "" });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/zeiten?monat=${t.datum.slice(0, 7)}`} className="flex w-fit items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeftIcon className="size-4" /> Meine Zeiten
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{aenderbar ? "Zeit ändern" : "Zeit"}</h1>
        <p className="text-sm text-muted-foreground">
          Eingetragen von {name(t.erstellt_von)} am {formatDatumZeit(t.created_at)}
          {t.bearbeitet_von && t.updated_at !== t.created_at && ` · zuletzt geändert von ${name(t.bearbeitet_von)}`}
        </p>
      </div>

      {aenderbar ? (
        <>
          <Warteschlange userId={nutzer.id} />
          <ZeitFormular
            daten={daten}
            bestehend={{
              id: t.id,
              datum: t.datum,
              projektId: t.project_id,
              art: t.art,
              modus: t.von ? "uhrzeit" : "stunden",
              von: uhrzeitKurz(t.von),
              bis: uhrzeitKurz(t.bis),
              pauseMin: t.pause_min,
              stunden: t.stunden,
              beschreibung: t.beschreibung ?? "",
            }}
          />
        </>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border p-4 text-base">
            {!istMeine && (<><dt className="text-muted-foreground">Für</dt><dd>{name(t.user_id)}</dd></>)}
            <dt className="text-muted-foreground">Tag</dt><dd>{formatDatumLang(t.datum)}</dd>
            <dt className="text-muted-foreground">Art</dt><dd>{ZEIT_ART_NAMEN[t.art]}</dd>
            <dt className="text-muted-foreground">Baustelle</dt><dd>{t.projects?.name ?? "–"}</dd>
            {t.von && (<><dt className="text-muted-foreground">Zeit</dt><dd>{uhrzeitKurz(t.von)}–{uhrzeitKurz(t.bis)}, {t.pause_min} Min Pause</dd></>)}
            <dt className="text-muted-foreground">Stunden</dt><dd className="font-semibold">{formatStunden(t.stunden)}</dd>
            {t.beschreibung && (<><dt className="text-muted-foreground">Notiz</dt><dd className="whitespace-pre-line">{t.beschreibung}</dd></>)}
          </dl>
          {grund && (
            <p className="flex gap-2 rounded-lg bg-muted p-3 text-sm">
              <LockIcon className="mt-0.5 size-4 shrink-0" /> {grund}
            </p>
          )}
        </>
      )}
    </div>
  );
}
