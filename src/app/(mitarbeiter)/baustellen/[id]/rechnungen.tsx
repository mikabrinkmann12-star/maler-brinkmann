import Link from "next/link";
import { ChevronRightIcon, ReceiptTextIcon } from "lucide-react";
import { RechnungStatusBadge } from "@/app/buero/rechnungen/status-badge";
import { formatBetrag, formatDatum } from "@/lib/format";
import { rechnungenLaden } from "@/lib/rechnung-daten";

/** Rechnungen dieses Projekts (nur Büro/Admin, die Seite ruft das nur für sie auf). */
export async function Rechnungen({ projektId }: { projektId: string }) {
  const { zeilen } = await rechnungenLaden({ projektId });
  if (zeilen.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><ReceiptTextIcon className="size-5" /> Rechnungen</h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {zeilen.map((r) => (
          <li key={r.id}>
            <Link href={`/buero/rechnungen/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.rechnungsnummer || "Entwurf"}: {r.betreff}</span>
                <span className="text-sm text-muted-foreground">{formatDatum(r.rechnungsdatum)} · {formatBetrag(r.brutto)} brutto</span>
              </span>
              <RechnungStatusBadge status={r.status} lexwareStatus={r.lexwareStatus} />
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
