import { ConstructionIcon } from "lucide-react";

/** Vorläufiger Inhalt für Seiten, die in einer späteren Phase gebaut werden. */
export function Platzhalter({
  titel,
  phase,
  children,
}: {
  titel: string;
  phase: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{titel}</h1>
      <div className="flex items-start gap-3 rounded-xl border border-dashed p-5 text-muted-foreground">
        <ConstructionIcon className="mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">Kommt in {phase}</p>
          {children && <div className="text-sm">{children}</div>}
        </div>
      </div>
    </div>
  );
}
