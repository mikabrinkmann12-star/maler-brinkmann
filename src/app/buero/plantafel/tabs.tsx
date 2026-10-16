import Link from "next/link";
import { cn } from "cn";

const TABS = [
  { id: "tag", name: "Tag", href: "/buero/plantafel" },
  { id: "woche", name: "Woche", href: "/buero/plantafel/woche" },
  { id: "monat", name: "Monat", href: "/buero/plantafel/monat" },
  { id: "termine", name: "Termine", href: "/buero/plantafel/termine" },
] as const;

export type PlantafelTab = (typeof TABS)[number]["id"];

/** Umschalter der Plantafel: Tag (Einteilung), Woche, Monat, Termine. Das Datum bleibt erhalten. */
export function PlantafelTabs({ aktiv, datum }: { aktiv: PlantafelTab; datum: string }) {
  return (
    <nav aria-label="Plantafel-Ansicht" className="flex w-fit gap-1 rounded-xl bg-muted p-1">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={`${t.href}?datum=${datum}`}
          aria-current={t.id === aktiv ? "page" : undefined}
          className={cn(
            "flex h-10 items-center rounded-lg px-4 text-sm font-medium transition-colors",
            t.id === aktiv ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.name}
        </Link>
      ))}
    </nav>
  );
}
