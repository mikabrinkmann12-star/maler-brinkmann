import { cn } from "cn";

/** Projektstatus als Pille wie in Plancraft: heller Grund in der Statusfarbe, dunklere Schrift und Punkt. */
export function StatusPille({ name, farbe, className }: { name: string; farbe?: string | null; className?: string }) {
  const f = farbe && /^#[0-9a-f]{6}$/i.test(farbe) ? farbe : "#94a3b8";
  return (
    <span
      className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", className)}
      style={{ backgroundColor: `color-mix(in srgb, ${f} 16%, white)`, color: `color-mix(in srgb, ${f} 55%, black)` }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: f }} />
      {name}
    </span>
  );
}
