"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, EyeIcon, EyeOffIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "cn";
import { darstellungSpeichern, darstellungZuruecksetzen, vorgabeSpeichern } from "@/app/(mitarbeiter)/einstellungen/darstellung/actions";
import { FormularMeldung } from "@/components/formular-meldung";
import { BUERO_MENUE } from "@/components/layout/buero-navigation";
import { Button } from "@/components/ui/button";
import { AKZENTE, AKZENT_NAMEN, STANDARD_AKZENT, menueOrdnen, wirksameDarstellung, type Akzent, type Darstellung } from "@/lib/darstellung";
import { rechtOk, type Rechte } from "@/lib/rechte";

/** Vorschaufarbe je Satz (gleiche Werte wie in globals.css). */
const MUSTER: Record<Akzent, string> = {
  gruen: "oklch(0.6 0.135 153)",
  blau: "oklch(0.52 0.15 255)",
  petrol: "oklch(0.5 0.085 205)",
  graphit: "oklch(0.36 0.012 150)",
  bordeaux: "oklch(0.46 0.15 18)",
};

function farbeZeigen(akzent: Akzent) {
  const html = document.documentElement;
  if (akzent === STANDARD_AKZENT) delete html.dataset.akzent;
  else html.dataset.akzent = akzent;
}

/**
 * Einstellung „Darstellung“: Farbsatz (sofortige Vorschau) und, für Büro-Nutzer, Reihenfolge und ausgeblendete Punkte der Seitenleiste.
 * Gespeichert wird nur, was man geändert hat; der Rest bleibt „wie die Vorgabe der Firma“.
 */
export function DarstellungFormular({
  eigene,
  firma,
  istBuero,
  istAdmin,
  darfVorgabe,
  rechte,
}: {
  eigene: Darstellung;
  firma: Darstellung;
  istBuero: boolean;
  istAdmin: boolean;
  darfVorgabe: boolean;
  rechte: Rechte;
}) {
  const router = useRouter();
  const wirksam = wirksameDarstellung(eigene, firma);
  const erlaubt = useMemo(() => BUERO_MENUE.filter((e) => (!e.nurAdmin || istAdmin) && (!e.recht || rechtOk(rechte, e.recht))), [istAdmin, rechte]);

  const [akzent, setAkzent] = useState<Akzent>(wirksam.akzent);
  const [akzentGeaendert, setAkzentGeaendert] = useState(false);
  const [reihenfolge, setReihenfolge] = useState<string[]>(() => menueOrdnen(erlaubt.map((e) => e.href), wirksam.reihenfolge, []));
  const [ausgeblendet, setAusgeblendet] = useState<string[]>(wirksam.ausgeblendet);
  const [menueGeaendert, setMenueGeaendert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  // Vorschau: Farbe sofort zeigen; beim Verlassen ohne Speichern wieder die gespeicherte
  useEffect(() => farbeZeigen(akzent), [akzent]);
  useEffect(() => () => farbeZeigen(wirksam.akzent), [wirksam.akzent]);

  const eintrag = (href: string) => erlaubt.find((e) => e.href === href);

  function verschieben(i: number, richtung: -1 | 1) {
    const j = i + richtung;
    if (j < 0 || j >= reihenfolge.length) return;
    const neu = [...reihenfolge];
    [neu[i], neu[j]] = [neu[j], neu[i]];
    setReihenfolge(neu);
    setMenueGeaendert(true);
    setHinweis(null);
  }
  function umschalten(href: string) {
    setAusgeblendet((alt) => (alt.includes(href) ? alt.filter((h) => h !== href) : [...alt, href]));
    setMenueGeaendert(true);
    setHinweis(null);
  }

  const daten = (): Darstellung => ({
    akzent: akzentGeaendert ? akzent : eigene.akzent,
    reihenfolge: menueGeaendert ? reihenfolge : eigene.reihenfolge,
    ausgeblendet: menueGeaendert ? ausgeblendet : eigene.ausgeblendet,
  });

  function ausfuehren(aktion: () => Promise<{ fehler?: string }>, text: string) {
    setFehler(null);
    setHinweis(null);
    starte(async () => {
      const r = await aktion();
      if (r.fehler) return setFehler(r.fehler);
      setAkzentGeaendert(false);
      setMenueGeaendert(false);
      setHinweis(text);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {hinweis && <FormularMeldung art="hinweis">{hinweis}</FormularMeldung>}

      <section className="flex flex-col gap-3 rounded-xl border p-4" aria-labelledby="farbe-titel">
        <div>
          <h2 id="farbe-titel" className="text-base font-semibold">Farbe</h2>
          <p className="text-sm text-muted-foreground">Für Knöpfe und Hervorhebungen. Du siehst sie sofort, gespeichert wird erst mit „Speichern“.</p>
        </div>
        <div role="radiogroup" aria-label="Farbe" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AKZENTE.map((a) => {
            const an = akzent === a;
            return (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={an}
                onClick={() => { setAkzent(a); setAkzentGeaendert(true); setHinweis(null); }}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-lg border px-3 text-left text-sm transition-[transform,border-color] duration-150 ease-out active:scale-[0.98]",
                  an ? "border-foreground font-semibold" : "hover:border-foreground/40",
                )}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full" style={{ background: MUSTER[a] }}>
                  {an && <CheckIcon className="size-4 text-white" />}
                </span>
                <span>{AKZENT_NAMEN[a]}</span>
                {a === (firma.akzent ?? STANDARD_AKZENT) && <span className="ml-auto text-xs font-normal text-muted-foreground">Vorgabe</span>}
              </button>
            );
          })}
        </div>
      </section>

      {istBuero && (
        <section className="flex flex-col gap-3 rounded-xl border p-4" aria-labelledby="menue-titel">
          <div>
            <h2 id="menue-titel" className="text-base font-semibold">Seitenleiste im Büro</h2>
            <p className="text-sm text-muted-foreground">
              Reihenfolge mit den Pfeilen ändern, mit dem Auge aus- und einblenden. Das ändert nur die Anzeige, nicht deine Rechte. Die Übersicht bleibt immer sichtbar.
            </p>
          </div>
          <ul className="flex flex-col divide-y rounded-lg border">
            {reihenfolge.map((href, i) => {
              const e = eintrag(href);
              if (!e) return null;
              const Icon = e.icon;
              const weg = ausgeblendet.includes(href) && href !== "/buero";
              return (
                <li key={href} className={cn("flex min-h-12 items-center gap-2 px-2", weg && "text-muted-foreground")}>
                  <Icon className="size-[18px] shrink-0" />
                  <span className={cn("min-w-0 flex-1 truncate text-sm", weg && "line-through")}>{e.name}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label={`${e.name} nach oben`} disabled={i === 0} onClick={() => verschieben(i, -1)}><ArrowUpIcon /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`${e.name} nach unten`} disabled={i === reihenfolge.length - 1} onClick={() => verschieben(i, 1)}><ArrowDownIcon /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={weg ? `${e.name} einblenden` : `${e.name} ausblenden`} aria-pressed={weg}
                    disabled={href === "/buero"} onClick={() => umschalten(href)}>
                    {weg ? <EyeOffIcon /> : <EyeIcon />}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" size="touch" disabled={laeuft || (!akzentGeaendert && !menueGeaendert)} onClick={() => ausfuehren(() => darstellungSpeichern(daten()), "Gespeichert.")}>
          <CheckIcon /> Speichern
        </Button>
        <Button type="button" size="touch" variant="outline" disabled={laeuft} onClick={() => ausfuehren(darstellungZuruecksetzen, "Zurückgesetzt, es gilt wieder die Vorgabe der Firma.")}>
          <RotateCcwIcon /> Auf Vorgabe zurücksetzen
        </Button>
        {darfVorgabe && (
          <Button type="button" size="touch" variant="outline" disabled={laeuft}
            onClick={() => ausfuehren(() => vorgabeSpeichern({ akzent, reihenfolge: istBuero ? reihenfolge : firma.reihenfolge, ausgeblendet: istBuero ? ausgeblendet : firma.ausgeblendet }), "Als Vorgabe für alle gespeichert. Sie gilt für jeden, der nichts Eigenes eingestellt hat.")}>
            Als Vorgabe für alle speichern
          </Button>
        )}
      </div>
    </div>
  );
}
