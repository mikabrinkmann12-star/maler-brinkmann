import Link from "next/link";
import { ChevronRightIcon, FileTextIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/app/buero/angebote/status-badge";
import { angeboteLaden } from "@/lib/angebot-daten";
import { formatBetrag, formatDatum } from "@/lib/format";

/** Angebote dieses Projekts (nur Büro/Admin, die Seite ruft das nur für sie auf). */
export async function Angebote({ projektId, archiviert }: { projektId: string; archiviert: boolean }) {
  const { zeilen } = await angeboteLaden({ projektId });
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><FileTextIcon className="size-5" /> Angebote</h2>
        {!archiviert && (
          <Link href={`/buero/angebote/neu?projekt=${projektId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <PlusIcon /> Neues Angebot
          </Link>
        )}
      </div>
      {zeilen.length === 0 ? (
        <p className="text-muted-foreground">Noch kein Angebot für dieses Projekt.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {zeilen.map((a) => (
            <li key={a.id}>
              <Link href={`/buero/angebote/${a.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.betreff}</span>
                  <span className="text-sm text-muted-foreground">{formatDatum(a.datum)} · {formatBetrag(a.netto)} netto</span>
                </span>
                <StatusBadge status={a.status} />
                <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
