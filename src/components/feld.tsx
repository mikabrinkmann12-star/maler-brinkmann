import { cn } from "cn";
import { Label } from "@/components/ui/label";

/** Beschriftung + Eingabe + optionaler Hinweis, einheitlich für alle Formulare. */
export function Feld({
  label,
  htmlFor,
  hinweis,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hinweis?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor} className="text-base">
        {label}
      </Label>
      {children}
      {hinweis && <p className="text-sm text-muted-foreground">{hinweis}</p>}
    </div>
  );
}

/** Natives Auswahlfeld im Stil der Eingabefelder (auf dem Handy angenehm). */
export function Auswahl({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
