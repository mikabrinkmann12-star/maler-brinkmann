import { cn } from "cn";
import { RECHNUNG_STATUS_NAMEN, type RechnungStatus } from "@/lib/rechnung";

const STATUS_NAMEN: Record<string, string> = { draft: "Entwurf", open: "Offen", paid: "Bezahlt", paidoff: "Bezahlt", voided: "Storniert" };

/** Status einer Rechnung: Entwurf, oder nach dem Fertigstellen offen/bezahlt/storniert (gespeichert in der Spalte lexware_status, ein Name aus früherer Zeit). */
export function RechnungStatusBadge({ status, lexwareStatus, className }: { status: RechnungStatus; lexwareStatus?: string; className?: string }) {
  let text: string = RECHNUNG_STATUS_NAMEN[status];
  let farbe = "bg-muted text-muted-foreground";
  if (status === "uebertragen") {
    text = lexwareStatus ? (STATUS_NAMEN[lexwareStatus] ?? lexwareStatus) : RECHNUNG_STATUS_NAMEN.uebertragen;
    farbe = lexwareStatus === "paid" || lexwareStatus === "paidoff" ? "bg-green-100 text-green-800" : lexwareStatus === "voided" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800";
  } else if (status === "wird_uebertragen") {
    farbe = "bg-amber-100 text-amber-900";
  }
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap", farbe, className)}>{text}</span>;
}
