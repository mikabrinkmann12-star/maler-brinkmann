import Link from "next/link";
import { cn } from "cn";

const REITER = [
  { id: "alle", text: "Alle Zeiten", href: "/buero/zeiten" },
  { id: "urlaub", text: "Offene Urlaubsanträge", href: "/buero/urlaub" },
  { id: "uebersicht", text: "Übersicht", href: "/buero/zeiten/uebersicht" },
] as const;

/** Reiter oben auf den Zeiten-Seiten (wie in Plancraft: Alle Zeiten | Offene Urlaubsanträge | Übersicht). */
export function ZeitenTabs({ aktiv, offeneAntraege = 0 }: { aktiv: (typeof REITER)[number]["id"]; offeneAntraege?: number }) {
  return (
    <nav aria-label="Zeiten" className="flex gap-5 border-b">
      {REITER.map((r) => (
        <Link
          key={r.id}
          href={r.href}
          aria-current={aktiv === r.id ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-[13px] transition-colors",
            aktiv === r.id ? "border-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {r.text}
          {r.id === "urlaub" && offeneAntraege > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">{offeneAntraege}</span>}
        </Link>
      ))}
    </nav>
  );
}
