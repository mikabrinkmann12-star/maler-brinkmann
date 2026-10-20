import Link from "next/link";
import { cn } from "cn";

const REITER = [
  { id: "zeiten", name: "Zeiten", href: "/zeiten" },
  { id: "urlaub", name: "Urlaubsanträge", href: "/urlaub" },
  { id: "konto", name: "Stundenkonto", href: "/zeiten/konto" },
] as const;

/** Die drei Reiter oben auf den Zeiten-Seiten (wie in Plancraft): Zeiten · Urlaubsanträge · Stundenkonto. */
export function ZeitenReiter({ aktiv }: { aktiv: (typeof REITER)[number]["id"] }) {
  return (
    <nav aria-label="Zeiten" className="grid grid-cols-3 rounded-xl border bg-card p-1">
      {REITER.map((r) => (
        <Link
          key={r.id}
          href={r.href}
          aria-current={r.id === aktiv ? "page" : undefined}
          className={cn(
            "flex h-10 items-center justify-center rounded-lg px-1 text-sm font-medium transition-colors",
            r.id === aktiv ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {r.name}
        </Link>
      ))}
    </nav>
  );
}
