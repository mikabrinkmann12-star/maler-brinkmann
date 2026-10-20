import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { tageVerschieben } from "@/lib/datum";
import { tagZahl, WOCHENTAGE_KURZ, wochenstart, wochenTage, wochenTitel } from "@/lib/woche";

/**
 * Wochenstreifen wie in Plancraft: Pfeile + „19.–25. Okt.“, darunter Mo–So.
 * Heute ist ein grüner Kreis, der gewählte Tag hat einen Rahmen.
 * `hrefFuer` baut die Adresse für einen Tag (z. B. `/heute?datum=…`).
 */
export function Wochenstreifen({
  gewaehlt,
  heute,
  hrefFuer,
}: {
  gewaehlt: string;
  heute: string;
  hrefFuer: (datum: string) => string;
}) {
  const tage = wochenTage(gewaehlt);
  const montag = wochenstart(gewaehlt);

  return (
    <div className="rounded-xl border bg-card px-2 pt-2 pb-3">
      <div className="mb-1 grid grid-cols-[3rem_1fr_3rem] items-center">
        <Link
          href={hrefFuer(tageVerschieben(gewaehlt, -7))}
          aria-label="Vorherige Woche"
          className="flex size-12 items-center justify-center rounded-full hover:bg-muted"
        >
          <ChevronLeftIcon className="size-6" />
        </Link>
        <p className="text-center font-semibold">{wochenTitel(montag)}</p>
        <Link
          href={hrefFuer(tageVerschieben(gewaehlt, 7))}
          aria-label="Nächste Woche"
          className="flex size-12 items-center justify-center rounded-full hover:bg-muted"
        >
          <ChevronRightIcon className="size-6" />
        </Link>
      </div>
      <ul className="grid grid-cols-7">
        {tage.map((tag, i) => {
          const istHeute = tag === heute;
          const istGewaehlt = tag === gewaehlt;
          return (
            <li key={tag} className="flex flex-col items-center gap-1">
              <span className="text-xs text-muted-foreground">{WOCHENTAGE_KURZ[i]}</span>
              <Link
                href={hrefFuer(tag)}
                aria-label={`${WOCHENTAGE_KURZ[i]} ${tagZahl(tag)}`}
                aria-current={istGewaehlt ? "date" : undefined}
                className={cn(
                  "flex size-10 items-center justify-center rounded-full text-base font-medium transition-colors",
                  istHeute && "bg-primary text-primary-foreground",
                  !istHeute && istGewaehlt && "bg-foreground text-background",
                  !istHeute && !istGewaehlt && "hover:bg-muted",
                  istHeute && !istGewaehlt && "opacity-70",
                )}
              >
                {tagZahl(tag)}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
