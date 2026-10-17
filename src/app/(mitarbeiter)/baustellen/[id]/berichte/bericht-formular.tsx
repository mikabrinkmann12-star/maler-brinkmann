"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, SaveIcon } from "lucide-react";
import { cn } from "cn";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ARBEITEN_MAX, BESONDERHEITEN_MAX, MAX_FOTOS, WETTER, WETTER_NAMEN, unterschriftPfad,
  type BautagesberichtDaten, type Wetter,
} from "@/lib/bericht";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { berichtAbschliessen, berichtSpeichern } from "../../bericht-actions";
import { UnterschriftFeld } from "./unterschrift-feld";

type Foto = { id: string; vorschauUrl: string | null; wann: string };

/** Bautagesbericht schreiben (Entwurf speichern, abschließen mit Unterschrift des Kunden). Bei einem Fehler bleibt alles stehen. */
export function BerichtFormular({
  projektId,
  berichtId,
  startDatum,
  start,
  team,
  fotos,
}: {
  projektId: string;
  berichtId: string;
  startDatum: string;
  start: BautagesberichtDaten;
  team: { id: string; name: string }[];
  fotos: Foto[];
}) {
  const router = useRouter();
  const [datum, setDatum] = useState(startDatum);
  const [wetter, setWetter] = useState<Wetter | "">(start.wetter ?? "");
  const [temperatur, setTemperatur] = useState(start.temperatur === null ? "" : String(start.temperatur));
  const [personal, setPersonal] = useState<string[]>(start.personal);
  const [arbeiten, setArbeiten] = useState(start.arbeiten);
  const [besonderheiten, setBesonderheiten] = useState(start.besonderheiten);
  const [gewaehlteFotos, setGewaehlteFotos] = useState<string[]>(start.fotos);
  const [abschlussOffen, setAbschlussOffen] = useState(false);
  const [name, setName] = useState("");
  const [png, setPng] = useState<Blob | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const umschalten = (liste: string[], id: string, max = 999) =>
    liste.includes(id) ? liste.filter((x) => x !== id) : liste.length < max ? [...liste, id] : liste;

  function eingabe() {
    const t = temperatur.trim().replace(",", ".");
    return {
      id: berichtId,
      projektId,
      art: "bautagesbericht" as const,
      datum,
      daten: { wetter: wetter || null, temperatur: t === "" ? null : Number(t), personal, arbeiten, besonderheiten, fotos: gewaehlteFotos },
    };
  }

  async function speichern(): Promise<boolean> {
    const e = eingabe();
    if (e.daten.temperatur !== null && !Number.isFinite(e.daten.temperatur)) {
      setFehler("Bitte die Temperatur als Zahl angeben.");
      return false;
    }
    const r = await berichtSpeichern(e);
    if (r.fehler) {
      setFehler(r.fehler);
      return false;
    }
    return true;
  }

  async function nurSpeichern() {
    setLaeuft(true);
    setFehler(null);
    try {
      if (await speichern()) router.push(`/baustellen/${projektId}/berichte`);
    } catch {
      setFehler("Das hat nicht geklappt (Netz?). Dein Bericht bleibt hier stehen, bitte nochmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  async function abschliessen() {
    if (png && !name.trim()) return setFehler("Bitte den Namen des Unterschreibenden angeben.");
    setLaeuft(true);
    setFehler(null);
    try {
      if (!(await speichern())) return;
      if (png) {
        const { error } = await createBrowserSupabase().storage
          .from("berichtunterschriften")
          .upload(unterschriftPfad(projektId, berichtId), png, { contentType: "image/png", upsert: false });
        // „schon vorhanden“ = ein früherer Versuch hat die Unterschrift schon hochgeladen
        if (error && !/already exists|duplicate/i.test(error.message)) return setFehler("Die Unterschrift konnte nicht hochgeladen werden. Bitte nochmal versuchen (Netz prüfen).");
      }
      const r = await berichtAbschliessen({ id: berichtId, projektId, unterschrift: png ? { name } : null });
      if (r.fehler) return setFehler(r.fehler);
      router.push(`/baustellen/${projektId}/berichte/${berichtId}`);
    } catch {
      setFehler("Das hat nicht geklappt (Netz?). Dein Bericht bleibt hier stehen, bitte nochmal versuchen.");
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      <Feld label="Datum" htmlFor="datum">
        <Input id="datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="h-12 text-base" />
      </Feld>

      <div className="grid grid-cols-2 gap-3">
        <Feld label="Wetter" htmlFor="wetter">
          <Auswahl id="wetter" value={wetter} onChange={(e) => setWetter(e.target.value as Wetter | "")}>
            <option value="">–</option>
            {WETTER.map((w) => <option key={w} value={w}>{WETTER_NAMEN[w]}</option>)}
          </Auswahl>
        </Feld>
        <Feld label="Temperatur (°C)" htmlFor="temperatur">
          <Input id="temperatur" inputMode="numeric" value={temperatur} onChange={(e) => setTemperatur(e.target.value)} placeholder="z. B. 12" className="h-12 text-base" />
        </Feld>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-medium">Anwesend</legend>
        {team.length === 0 && <p className="text-muted-foreground">Auf dieser Baustelle ist noch niemand eingetragen.</p>}
        <div className="flex flex-wrap gap-2">
          {team.map((t) => {
            const an = personal.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={an}
                onClick={() => setPersonal((p) => umschalten(p, t.id))}
                className={cn("flex h-12 items-center gap-2 rounded-full border px-4 text-base", an ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {an && <CheckIcon className="size-4" />} {t.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Feld label="Ausgeführte Arbeiten" htmlFor="arbeiten">
        <textarea id="arbeiten" value={arbeiten} onChange={(e) => setArbeiten(e.target.value)} maxLength={ARBEITEN_MAX} rows={6}
          placeholder="Was wurde heute gemacht?" className="w-full rounded-lg border bg-background px-3 py-2 text-base" />
      </Feld>

      <Feld label="Besonderheiten, Behinderungen, Mängel" htmlFor="besonderheiten" hinweis="Zum Beispiel Wartezeiten, fehlendes Material, Schäden, Absprachen mit dem Kunden.">
        <textarea id="besonderheiten" value={besonderheiten} onChange={(e) => setBesonderheiten(e.target.value)} maxLength={BESONDERHEITEN_MAX} rows={4}
          className="w-full rounded-lg border bg-background px-3 py-2 text-base" />
      </Feld>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-medium">Fotos ({gewaehlteFotos.length}/{MAX_FOTOS})</legend>
        {fotos.length === 0 ? (
          <p className="text-muted-foreground">Noch keine Fotos auf dieser Baustelle. Fotos machst du unter Ablage oder im Chat.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {fotos.map((f) => {
              const an = gewaehlteFotos.includes(f.id);
              return (
                <li key={f.id}>
                  <button type="button" aria-pressed={an} aria-label={`Foto vom ${f.wann}`} onClick={() => setGewaehlteFotos((x) => umschalten(x, f.id, MAX_FOTOS))}
                    className={cn("relative block aspect-square w-full overflow-hidden rounded-lg border-2", an ? "border-primary" : "border-transparent")}>
                    {f.vorschauUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.vorschauUrl} alt="" className="size-full object-cover" />
                    )}
                    {an && <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckIcon className="size-4" /></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {abschlussOffen ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-lg font-semibold">Bericht abschließen</h2>
          <p className="text-sm text-muted-foreground">Danach kann der Bericht nicht mehr geändert werden. Die Unterschrift des Kunden ist freiwillig.</p>
          <Feld label="Name des Unterschreibenden" htmlFor="unterschrift-name">
            <Input id="unterschrift-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="z. B. Frau Müller" className="h-12 text-base" />
          </Feld>
          <UnterschriftFeld onChange={setPng} />
          <Button type="button" size="touch" disabled={laeuft} onClick={() => void abschliessen()}>
            <CheckIcon /> {laeuft ? "Wird gespeichert …" : png ? "Mit Unterschrift abschließen" : "Ohne Unterschrift abschließen"}
          </Button>
          <Button type="button" variant="ghost" size="touch" disabled={laeuft} onClick={() => setAbschlussOffen(false)}>Zurück zum Bericht</Button>
        </section>
      ) : (
        <div className="flex flex-col gap-2">
          <Button type="button" size="touch" disabled={laeuft} onClick={() => setAbschlussOffen(true)}>
            <CheckIcon /> Abschließen …
          </Button>
          <Button type="button" variant="outline" size="touch" disabled={laeuft} onClick={() => void nurSpeichern()}>
            <SaveIcon /> {laeuft ? "Wird gespeichert …" : "Als Entwurf speichern"}
          </Button>
        </div>
      )}
    </div>
  );
}
