import Link from "next/link";
import { CalendarClockIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { monatVerschieben, monatsGrenzen, tageVerschieben } from "@/lib/datum";
import { formatMonat, formatTagKurz } from "@/lib/format";
import {
  istWochenende,
  mitarbeiterZelle,
  projektZelle,
  projekteImZeitraum,
  tageListe,
  wochenAnfang,
  type KalDaten,
} from "@/lib/kalender";
import { PlantafelTabs } from "./tabs";

type Person = { id: string; vorname: string; nachname: string };
const FARBEN = [
  "border-l-sky-500 bg-sky-50",
  "border-l-emerald-500 bg-emerald-50",
  "border-l-violet-500 bg-violet-50",
  "border-l-orange-500 bg-orange-50",
  "border-l-rose-500 bg-rose-50",
  "border-l-teal-500 bg-teal-50",
  "border-l-indigo-500 bg-indigo-50",
  "border-l-lime-600 bg-lime-50",
];

/** Gleiche Baustelle = gleiche Farbe (stabil nach Name sortiert). */
function farbeFuer(id: string, ids: string[]): string {
  return FARBEN[Math.max(0, ids.indexOf(id)) % FARBEN.length];
}

export function Kalender({
  modus,
  datum,
  ansicht,
  daten,
  personen,
  projektNamen,
}: {
  modus: "woche" | "monat";
  datum: string;
  ansicht: "mitarbeiter" | "projekte";
  daten: KalDaten;
  personen: Person[];
  projektNamen: Map<string, string>;
}) {
  const monat = datum.slice(0, 7);
  const { von, bis } = modus === "woche"
    ? { von: wochenAnfang(datum), bis: tageVerschieben(wochenAnfang(datum), 6) }
    : { von: monatsGrenzen(monat).erster, bis: monatsGrenzen(monat).letzter };
  const tage = tageListe(von, bis);
  const kompakt = modus === "monat";
  const projekte = projekteImZeitraum(daten, projektNamen);
  const projektIds = projekte.map((p) => p.id);
  const basis = `/buero/plantafel/${modus}`;
  const vorher = modus === "woche" ? tageVerschieben(von, -7) : `${monatVerschieben(monat, -1)}-01`;
  const nachher = modus === "woche" ? tageVerschieben(von, 7) : `${monatVerschieben(monat, 1)}-01`;
  const titel = modus === "woche" ? `${formatTagKurz(von)} – ${formatTagKurz(bis)}` : formatMonat(monat);
  const tagLink = (t: string) => `/buero/plantafel?datum=${t}`;

  return (
    <div className="flex flex-col gap-4">
      <PlantafelTabs aktiv={modus} datum={datum} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`${basis}?datum=${vorher}&ansicht=${ansicht}`} aria-label="Zurück" className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
            <ChevronLeftIcon />
          </Link>
          <h1 className="min-w-44 text-center text-xl font-semibold">{titel}</h1>
          <Link href={`${basis}?datum=${nachher}&ansicht=${ansicht}`} aria-label="Weiter" className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
            <ChevronRightIcon />
          </Link>
        </div>
        <div className="flex gap-1 rounded-xl bg-muted p-1 text-sm" role="group" aria-label="Zeilen">
          {(["mitarbeiter", "projekte"] as const).map((a) => (
            <Link key={a} href={`${basis}?datum=${datum}&ansicht=${a}`} aria-current={a === ansicht ? "true" : undefined}
              className={cn("flex h-9 items-center rounded-lg px-3 font-medium", a === ansicht ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {a === "mitarbeiter" ? "Pro Mitarbeiter" : "Pro Baustelle"}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="sticky left-0 z-10 min-w-32 bg-muted p-2 text-left font-medium">{ansicht === "mitarbeiter" ? "Mitarbeiter" : "Baustelle"}</th>
              {tage.map((t) => (
                <th key={t} className={cn("p-1 text-center font-medium", kompakt ? "min-w-9 text-xs" : "min-w-28", istWochenende(t) && "text-muted-foreground")}>
                  <Link href={tagLink(t)} className="block rounded px-1 py-1 hover:bg-background">
                    {kompakt ? t.slice(8) : formatTagKurz(t)}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ansicht === "mitarbeiter"
              ? personen.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <th scope="row" className="sticky left-0 z-10 bg-background p-2 text-left font-medium">{p.vorname} {p.nachname[0] && `${p.nachname[0]}.`}</th>
                    {tage.map((t) => {
                      const z = mitarbeiterZelle(p.id, t, daten);
                      return (
                        <td key={t} className={cn("p-0.5 align-top", istWochenende(t) && "bg-muted/40")}>
                          <Link href={tagLink(t)} className="flex min-h-12 flex-col gap-0.5 rounded p-0.5 hover:bg-muted/60"
                            title={[z.abwesend?.text, ...z.einsaetze.map((e) => `${e.fahrzeug}: ${e.projekte.map((p) => p.name).join(", ")}`), ...z.termine.map((x) => `Termin: ${x}`)].filter(Boolean).join("\n") || undefined}>
                            {z.abwesend && (
                              <span className={cn("rounded px-1 text-center text-xs font-medium",
                                z.abwesend.text === "Krank" ? "bg-red-100 text-red-900" : "bg-green-100 text-green-900",
                                z.abwesend.offen && "border border-dashed border-amber-500 bg-amber-50 text-amber-900")}>
                                {kompakt ? z.abwesend.text[0] : `${z.abwesend.text}${z.abwesend.offen ? "?" : ""}`}
                              </span>
                            )}
                            {z.einsaetze.flatMap((e) => e.projekte.map((p) => (
                              <span key={`${e.fahrzeug}-${p.id}`} className={cn("truncate rounded border-l-4 px-1 text-xs", farbeFuer(p.id, projektIds))}>
                                {kompakt ? "" : p.name}
                              </span>
                            )))}
                            {z.termine.length > 0 && (
                              <span className="flex items-center gap-0.5 rounded bg-sky-100 px-1 text-xs text-sky-900">
                                <CalendarClockIcon className="size-3 shrink-0" />
                                {!kompakt && <span className="truncate">{z.termine.join(", ")}</span>}
                              </span>
                            )}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))
              : projekte.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <th scope="row" className="sticky left-0 z-10 max-w-48 truncate bg-background p-2 text-left font-medium">{p.name}</th>
                    {tage.map((t) => {
                      const z = projektZelle(p.id, t, daten);
                      const namen = z.personIds.map((id) => personen.find((x) => x.id === id)?.vorname ?? "?");
                      const leer = !z.autos.length && !z.termine.length;
                      return (
                        <td key={t} className={cn("p-0.5 align-top", istWochenende(t) && "bg-muted/40")}>
                          <Link href={tagLink(t)} className="flex min-h-12 flex-col gap-0.5 rounded p-0.5 hover:bg-muted/60"
                            title={[...z.autos, namen.join(", "), ...z.termine.map((x) => `Termin: ${x}`)].filter(Boolean).join("\n") || undefined}>
                            {!leer && z.autos.length > 0 && (
                              <span className={cn("truncate rounded border-l-4 px-1 text-xs", farbeFuer(p.id, projektIds))}>
                                {kompakt ? namen.length : namen.join(", ")}
                              </span>
                            )}
                            {z.termine.length > 0 && (
                              <span className="flex items-center gap-0.5 rounded bg-sky-100 px-1 text-xs text-sky-900">
                                <CalendarClockIcon className="size-3 shrink-0" />
                                {!kompakt && <span className="truncate">{z.termine.join(", ")}</span>}
                              </span>
                            )}
                          </Link>
                        </td>
                      );
                    })}
                  </tr>
                ))}
            {ansicht === "projekte" && projekte.length === 0 && (
              <tr><td colSpan={tage.length + 1} className="p-6 text-center text-muted-foreground">In diesem Zeitraum ist keine Baustelle eingeteilt.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <li className="flex items-center gap-1"><span className="rounded bg-green-100 px-1 text-green-900">Urlaub</span> genehmigt</li>
        <li className="flex items-center gap-1"><span className="rounded border border-dashed border-amber-500 bg-amber-50 px-1 text-amber-900">Urlaub?</span> beantragt, offen</li>
        <li className="flex items-center gap-1"><span className="rounded bg-red-100 px-1 text-red-900">Krank</span></li>
        <li className="flex items-center gap-1"><span className="flex items-center gap-0.5 rounded bg-sky-100 px-1 text-sky-900"><CalendarClockIcon className="size-3" /> Termin</span></li>
        <li>Farbe = Baustelle · Tippen öffnet die Einteilung des Tages</li>
      </ul>
    </div>
  );
}
