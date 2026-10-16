import { cn } from "cn";
import { STATUS_NAMEN, type AngebotStatus } from "@/lib/angebot";

const FARBEN: Record<AngebotStatus, string> = {
  entwurf: "bg-muted text-muted-foreground",
  versendet: "bg-blue-100 text-blue-800",
  angenommen: "bg-green-100 text-green-800",
  abgelehnt: "bg-red-100 text-red-800",
};

export function StatusBadge({ status, className }: { status: AngebotStatus; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap", FARBEN[status], className)}>
      {STATUS_NAMEN[status]}
    </span>
  );
}
