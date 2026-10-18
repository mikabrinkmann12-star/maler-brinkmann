import type { ReactNode } from "react";

/** Eingabefeld im Stil von Plancraft (klein, weiß, feiner Rand). */
export const EINGABE =
  "h-8 w-full rounded-md border border-border bg-white px-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

/** Abschnitt mit Überschrift und feiner Linie daneben (wie in Plancraft). */
export function Abschnitt({ titel, zusatz, children }: { titel: string; zusatz?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="flex items-center gap-3 text-[15px] font-semibold">
        <span className="flex items-center gap-1.5 whitespace-nowrap">{titel}{zusatz}</span>
        <span className="h-px flex-1 bg-border" />
      </h2>
      {children}
    </section>
  );
}

/** Zeile: Beschriftung links, Feld rechts, optional ein Hinweis daneben. */
export function Zeile({ label, htmlFor, hinweis, children }: { label: string; htmlFor?: string; hinweis?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-start gap-x-4 gap-y-1 sm:grid-cols-[8rem_minmax(0,18rem)_1fr]">
      <label htmlFor={htmlFor} className="pt-1.5 text-[13px]">{label}</label>
      <div>{children}</div>
      {hinweis && <div className="pt-1.5 text-[13px] sm:col-start-3">{hinweis}</div>}
    </div>
  );
}
