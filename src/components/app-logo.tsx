import { cn } from "cn";

/** Platzhalter-Logo „MB“, bis das echte Firmenlogo da ist. */
export function AppLogo({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground",
        className,
      )}
    >
      MB
    </div>
  );
}
