"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon, FileTextIcon, ImageIcon, PaperclipIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { cn } from "cn";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { fotoPfade, fotoVorbereiten, vorschauPfad } from "@/lib/bild";
import { CHAT_MAX_ZEICHEN, erwaehnt, erwaehnungEinsetzen, erwaehnungsVorschlaege, nachTagen, tagesUeberschrift } from "@/lib/chat";
import { DATEI_ACCEPT, dateiPfad, dateiPruefen, groesseText } from "@/lib/dateien";
import { formatDatumLang, formatUhrzeit } from "@/lib/format";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { neueId } from "@/lib/warteschlange";
import { fotoSpeichern } from "../../actions";
import { dateiSpeichern } from "../../datei-actions";
import { chatGelesen, nachrichtEntfernen, nachrichtSenden } from "../../chat-actions";

type Nachricht = {
  id: string;
  text: string;
  erstellt_von: string | null;
  created_at: string;
  foto_id: string | null;
  datei_id: string | null;
  project_photos: { storage_pfad: string } | null;
  project_files: { storage_pfad: string; dateiname: string; groesse_bytes: number | null } | null;
};

type Adressen = Record<string, string>;
type Reiter = "nachrichten" | "erwaehnungen" | "galerie";

const REITER: { id: Reiter; name: string }[] = [
  { id: "nachrichten", name: "Nachrichten" },
  { id: "erwaehnungen", name: "Erwähnungen" },
  { id: "galerie", name: "Galerie" },
];
type Anhang = { art: "foto"; vorbereitet: Awaited<ReturnType<typeof fotoVorbereiten>>; name: string; vorschau: string } | { art: "datei"; datei: File; typ: string; endung: string };

const ABFRAGE_MS = 5000;
const SPALTEN =
  "id, text, erstellt_von, created_at, foto_id, datei_id, project_photos(storage_pfad), project_files(storage_pfad, dateiname, groesse_bytes)";

/** Chat eines Projekts: Nachrichten (neueste unten), Foto/Datei anhängen. Ohne Push: alle 5 Sekunden nachsehen, solange die Seite offen ist. */
export function ChatAnsicht({
  projektId,
  ichId,
  ichVorname,
  ichNachname,
  istBuero,
  darfSchreiben,
  namen,
}: {
  projektId: string;
  ichId: string;
  ichVorname: string;
  ichNachname: string;
  istBuero: boolean;
  darfSchreiben: boolean;
  namen: Record<string, string>;
}) {
  const [nachrichten, setNachrichten] = useState<Nachricht[] | null>(null);
  const [adressen, setAdressen] = useState<Adressen>({});
  const [text, setText] = useState("");
  const [anhang, setAnhang] = useState<Anhang | null>(null);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [frage, setFrage] = useState<string | null>(null);
  const [reiter, setReiter] = useState<Reiter>("nachrichten");
  const kameraRef = useRef<HTMLInputElement>(null);
  const galerieRef = useRef<HTMLInputElement>(null);
  const dateiRef = useRef<HTMLInputElement>(null);
  const endeRef = useRef<HTMLDivElement>(null);
  const letzteAnzahl = useRef(0);
  const gelesenFuer = useRef("");
  const bekannteAdressen = useRef<Adressen>({});

  const laden = useCallback(async () => {
    const supabase = createBrowserSupabase();
    const { data } = await supabase
      .from("project_messages")
      .select(SPALTEN)
      .eq("project_id", projektId)
      .is("archiviert_am", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!data) return;
    const liste = (data as unknown as Nachricht[]).slice().reverse();

    // Adressen für Anhänge, die wir noch nicht kennen (privater Speicher, 1 Stunde gültig)
    const fotoPfadeNeu = liste.flatMap((n) => (n.project_photos ? [n.project_photos.storage_pfad, vorschauPfad(n.project_photos.storage_pfad)] : [])).filter((p) => !bekannteAdressen.current[p]);
    const dateiPfadeNeu = liste.flatMap((n) => (n.project_files ? [n.project_files.storage_pfad] : [])).filter((p) => !bekannteAdressen.current[p]);
    const neu: Adressen = {};
    if (fotoPfadeNeu.length) {
      const { data: a } = await supabase.storage.from("projektfotos").createSignedUrls(fotoPfadeNeu, 3600);
      for (const x of a ?? []) if (x.path && x.signedUrl) neu[x.path] = x.signedUrl;
    }
    if (dateiPfadeNeu.length) {
      const { data: a } = await supabase.storage.from("projektdateien").createSignedUrls(dateiPfadeNeu, 3600);
      for (const x of a ?? []) if (x.path && x.signedUrl) neu[x.path] = x.signedUrl;
    }
    if (Object.keys(neu).length) {
      bekannteAdressen.current = { ...bekannteAdressen.current, ...neu };
      setAdressen(bekannteAdressen.current);
    }
    setNachrichten(liste);

    // Gelesen markieren, sobald etwas Neues da ist (und die Seite sichtbar ist)
    const letzte = liste[liste.length - 1]?.id ?? "";
    if (letzte && letzte !== gelesenFuer.current && document.visibilityState === "visible") {
      gelesenFuer.current = letzte;
      void chatGelesen(projektId);
    }
  }, [projektId]);

  useEffect(() => {
    void laden();
    const takt = window.setInterval(() => {
      if (document.visibilityState === "visible") void laden();
    }, ABFRAGE_MS);
    const sichtbar = () => void laden();
    document.addEventListener("visibilitychange", sichtbar);
    window.addEventListener("online", sichtbar);
    return () => {
      window.clearInterval(takt);
      document.removeEventListener("visibilitychange", sichtbar);
      window.removeEventListener("online", sichtbar);
    };
  }, [laden]);

  // Bei neuen Nachrichten nach unten scrollen
  useEffect(() => {
    const anzahl = nachrichten?.length ?? 0;
    if (anzahl !== letzteAnzahl.current) {
      letzteAnzahl.current = anzahl;
      if (reiter === "nachrichten") endeRef.current?.scrollIntoView({ block: "end" });
    }
  }, [nachrichten, reiter]);

  async function anhangWaehlen(art: "foto" | "datei", liste: FileList | null, eingabe: HTMLInputElement | null) {
    const datei = liste?.[0];
    if (eingabe) eingabe.value = "";
    if (!datei) return;
    setFehler(null);
    if (art === "foto") {
      try {
        const vorbereitet = await fotoVorbereiten(datei);
        setAnhang({ art: "foto", vorbereitet, name: datei.name, vorschau: URL.createObjectURL(vorbereitet.vorschau) });
      } catch {
        setFehler(`„${datei.name}“ kann nicht gelesen werden.`);
      }
      return;
    }
    const pruefung = dateiPruefen(datei.name, datei.size);
    if (!pruefung.ok) return setFehler(pruefung.fehler);
    setAnhang({ art: "datei", datei, typ: pruefung.typ, endung: pruefung.endung });
  }

  function anhangEntfernen() {
    if (anhang?.art === "foto") URL.revokeObjectURL(anhang.vorschau);
    setAnhang(null);
  }

  /** Anhang hochladen (er landet auch in der Ablage) und liefert die ID des Foto-/Datei-Eintrags. */
  async function anhangHochladen(a: Anhang): Promise<{ fotoId?: string; dateiId?: string; fehler?: string }> {
    const supabase = createBrowserSupabase();
    const id = neueId();
    if (a.art === "foto") {
      const pfade = fotoPfade(projektId, id);
      const speicher = supabase.storage.from("projektfotos");
      for (const [pfad, blob] of [[pfade.vorschau, a.vorbereitet.vorschau], [pfade.bild, a.vorbereitet.bild]] as const) {
        const { error } = await speicher.upload(pfad, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
        if (error) return { fehler: "Das Foto konnte nicht hochgeladen werden. Bitte nochmal versuchen (Netz prüfen)." };
      }
      const r = await fotoSpeichern({
        id, projektId, kategorie: "sonstiges", kommentar: "Aus dem Chat",
        breite: a.vorbereitet.breite, hoehe: a.vorbereitet.hoehe, groesseBytes: a.vorbereitet.bild.size,
      });
      return r.fehler ? { fehler: r.fehler } : { fotoId: id };
    }
    const { error } = await supabase.storage.from("projektdateien").upload(dateiPfad(projektId, id, a.endung), a.datei, { contentType: a.typ, upsert: false });
    if (error) return { fehler: `„${a.datei.name}“ konnte nicht hochgeladen werden. Bitte nochmal versuchen (Netz prüfen).` };
    const r = await dateiSpeichern({ id, projektId, dateiname: a.datei.name, groesseBytes: a.datei.size });
    return r.fehler ? { fehler: r.fehler } : { dateiId: id };
  }

  async function senden() {
    if (sendet) return;
    const inhalt = text.trim();
    if (!inhalt && !anhang) return;
    setSendet(true);
    setFehler(null);
    try {
      let ids: { fotoId?: string; dateiId?: string } = {};
      if (anhang) {
        const r = await anhangHochladen(anhang);
        if (r.fehler) return setFehler(r.fehler); // Eingabe bleibt stehen
        ids = r;
      }
      const r = await nachrichtSenden({ id: neueId(), projektId, text: inhalt, ...ids });
      if (r.fehler) return setFehler(r.fehler);
      setText("");
      anhangEntfernen();
      await laden();
    } catch {
      setFehler("Das hat nicht geklappt (Netz?). Deine Nachricht bleibt hier stehen, bitte nochmal senden.");
    } finally {
      setSendet(false);
    }
  }

  async function entfernen(id: string) {
    setFehler(null);
    const r = await nachrichtEntfernen(id, projektId);
    if (r.fehler) return setFehler(r.fehler);
    setFrage(null);
    await laden();
  }

  const gruppen = nachTagen(nachrichten ?? []);
  // Erwähnungen und Galerie entstehen aus denselben Nachrichten (keine eigene Tabelle)
  const erwaehnungen = (nachrichten ?? []).filter((n) => n.text && n.erstellt_von !== ichId && erwaehnt(n.text, ichVorname, ichNachname));
  const fotos = (nachrichten ?? []).filter((n) => n.project_photos).slice().reverse();
  const vorschlaege = darfSchreiben
    ? erwaehnungsVorschlaege(text, Object.entries(namen).filter(([id]) => id !== ichId).map(([id, name]) => ({ id, name })))
    : [];

  const renderGruppen = (gruppenListe: ReturnType<typeof nachTagen<Nachricht>>) =>
    gruppenListe.map((g) => (
          <section key={g.tag} className="flex flex-col gap-2">
            <h2 className="self-center rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground">
              {tagesUeberschrift(g.tag, new Date(), formatDatumLang)}
            </h2>
            {g.nachrichten.map((n) => {
              const meine = n.erstellt_von === ichId;
              const bild = n.project_photos ? adressen[n.project_photos.storage_pfad] : undefined;
              const vorschau = n.project_photos ? adressen[vorschauPfad(n.project_photos.storage_pfad)] ?? bild : undefined;
              const datei = n.project_files ? adressen[n.project_files.storage_pfad] : undefined;
              return (
                <div key={n.id} className={cn("flex flex-col gap-1", meine ? "items-end" : "items-start")}>
                  <div className={cn("max-w-[85%] rounded-2xl px-3 py-2", meine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                    {!meine && <p className="text-xs font-semibold opacity-80">{namen[n.erstellt_von ?? ""] ?? "Ehemaliger Kollege"}</p>}
                    {n.project_photos && (
                      vorschau ? (
                        <a href={bild ?? vorschau} target="_blank" rel="noreferrer" className="my-1 block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={vorschau} alt="Foto aus dem Chat" className="max-h-64 rounded-lg" />
                        </a>
                      ) : (
                        <p className="my-1 flex items-center gap-2 text-sm"><ImageIcon className="size-4" /> Foto lädt …</p>
                      )
                    )}
                    {n.project_files && (
                      <a href={datei} target="_blank" rel="noreferrer" className="my-1 flex items-center gap-2 underline-offset-2 hover:underline">
                        <FileTextIcon className="size-5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{n.project_files.dateiname}</span>
                          <span className="block text-xs opacity-80">{groesseText(Number(n.project_files.groesse_bytes ?? 0))}</span>
                        </span>
                      </a>
                    )}
                    {n.text && <p className="whitespace-pre-line break-words">{n.text}</p>}
                    <p className="mt-0.5 text-right text-xs opacity-70">{formatUhrzeit(n.created_at)}</p>
                  </div>
                  {darfSchreiben && (meine || istBuero) && (
                    frage === n.id ? (
                      <span className="flex items-center gap-1">
                        <Button type="button" variant="destructive" size="sm" onClick={() => void entfernen(n.id)}>Entfernen</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setFrage(null)}>Abbrechen</Button>
                      </span>
                    ) : (
                      <button type="button" aria-label="Nachricht entfernen" className="text-muted-foreground" onClick={() => setFrage(n.id)}>
                        <Trash2Icon className="size-4" />
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </section>
    ));


  return (
    <div className="flex flex-1 flex-col gap-3">
      <div role="tablist" aria-label="Chat-Bereiche" className="flex gap-2">
        {REITER.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={reiter === r.id}
            onClick={() => setReiter(r.id)}
            className={cn(
              "min-h-10 rounded-full px-4 text-sm font-medium transition-colors",
              reiter === r.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70",
            )}
          >
            {r.name}
            {r.id === "erwaehnungen" && erwaehnungen.length > 0 && <span className="ml-1.5 opacity-70">{erwaehnungen.length}</span>}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-4">
        {nachrichten === null && <p className="text-muted-foreground">Lädt …</p>}
        {reiter === "nachrichten" && nachrichten?.length === 0 && (
          <p className="rounded-xl border border-dashed p-5 text-muted-foreground">
            Noch keine Nachrichten. {darfSchreiben ? "Schreib die erste." : ""}
          </p>
        )}
        {reiter === "nachrichten" && renderGruppen(gruppen)}
        {reiter === "erwaehnungen" && (
          erwaehnungen.length === 0 ? (
            <p className="rounded-xl border border-dashed p-5 text-muted-foreground">
              Noch keine Erwähnungen. Erwähne jemanden mit @ und seinem Namen, dann steht die Nachricht hier.
            </p>
          ) : (
            renderGruppen(nachTagen(erwaehnungen))
          )
        )}
        {reiter === "galerie" && (
          fotos.length === 0 ? (
            <p className="rounded-xl border border-dashed p-5 text-muted-foreground">Noch keine Fotos im Chat.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-1.5">
              {fotos.map((n) => {
                const pfad = n.project_photos?.storage_pfad ?? "";
                const gross = adressen[pfad];
                const klein = adressen[vorschauPfad(pfad)] ?? gross;
                return (
                  <li key={n.id} className="aspect-square overflow-hidden rounded-lg bg-muted">
                    {klein ? (
                      <a href={gross ?? klein} target="_blank" rel="noreferrer" aria-label={`Foto von ${namen[n.erstellt_von ?? ""] ?? "Ehemaliger Kollege"}, ${formatUhrzeit(n.created_at)}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={klein} alt="" className="size-full object-cover" />
                      </a>
                    ) : (
                      <span className="flex size-full items-center justify-center text-muted-foreground"><ImageIcon className="size-6" /></span>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        )}
        {/* Abstand unten, damit die letzte Nachricht nicht unter dem Eingabefeld und der Navigation verschwindet */}
        <div ref={endeRef} className="scroll-mb-64" />
      </div>

      {reiter !== "nachrichten" ? null : darfSchreiben ? (
        <div className="sticky bottom-20 flex flex-col gap-2 rounded-xl border bg-background p-2 shadow-sm">
          {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
          {anhang && (
            <div className="flex items-center gap-2 rounded-lg bg-muted px-2 py-1 text-sm">
              {anhang.art === "foto" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={anhang.vorschau} alt="" className="size-10 rounded object-cover" />
              ) : (
                <FileTextIcon className="size-5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{anhang.art === "foto" ? anhang.name : anhang.datei.name}</span>
              <button type="button" aria-label="Anhang entfernen" onClick={anhangEntfernen}><XIcon className="size-5" /></button>
            </div>
          )}
          {vorschlaege.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Wen meinst du?">
              {vorschlaege.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => setText((t) => erwaehnungEinsetzen(t, v.name))} className="min-h-10 rounded-full bg-muted px-3 text-sm font-medium">
                    @{v.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={CHAT_MAX_ZEICHEN}
            rows={2}
            placeholder="Nachricht schreiben … (mit @ jemanden erwähnen)"
            aria-label="Nachricht"
            className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-base"
          />
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-touch" aria-label="Foto aufnehmen" disabled={sendet} onClick={() => kameraRef.current?.click()}><CameraIcon /></Button>
            <Button type="button" variant="ghost" size="icon-touch" aria-label="Foto aus der Galerie" disabled={sendet} onClick={() => galerieRef.current?.click()}><ImageIcon /></Button>
            <Button type="button" variant="ghost" size="icon-touch" aria-label="Datei anhängen" disabled={sendet} onClick={() => dateiRef.current?.click()}><PaperclipIcon /></Button>
            <Button type="button" size="touch" className="ml-auto" disabled={sendet || (!text.trim() && !anhang)} onClick={() => void senden()}>
              <SendIcon /> {sendet ? "Sendet …" : "Senden"}
            </Button>
          </div>
          <input ref={kameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void anhangWaehlen("foto", e.target.files, e.target)} />
          <input ref={galerieRef} type="file" accept="image/*" className="hidden" onChange={(e) => void anhangWaehlen("foto", e.target.files, e.target)} />
          <input ref={dateiRef} type="file" accept={DATEI_ACCEPT} className="hidden" onChange={(e) => void anhangWaehlen("datei", e.target.files, e.target)} />
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Die Baustelle ist archiviert. Der Chat ist nur noch zum Lesen.</p>
      )}
    </div>
  );
}
