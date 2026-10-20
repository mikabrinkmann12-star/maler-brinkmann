import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, FileTextIcon, PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BERICHT_ART_NAMEN, datenLesen, wetterText, type BerichtArt } from "@/lib/bericht";
import { berichtKontext } from "@/lib/bericht-daten";
import { formatDatum } from "@/lib/format";

export const metadata: Metadata = { title: "Berichte" };

export default async function BerichteSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const k = await berichtKontext(id);
  const { data } = await k.supabase
    .from("project_reports")
    .select("id, art, datum, status, daten, erstellt_von, unterschrift_name, created_at")
    .eq("project_id", id)
    .is("archiviert_am", null)
    .order("datum", { ascending: false })
    .order("created_at", { ascending: false });
  const berichte = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {k.darfSchreiben && (
        <Link href={`/baustellen/${id}/berichte/neu`} className={buttonVariants({ size: "touch", className: "w-full" })}>
          <PlusIcon /> Neuer Bautagesbericht
        </Link>
      )}
      {berichte.length === 0 && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">Noch keine Berichte.</p>}
      <ul className="flex flex-col gap-3">
        {berichte.map((b) => {
          const daten = datenLesen(b.daten);
          const wetter = wetterText(daten.wetter, daten.temperatur);
          return (
            <li key={b.id}>
              <Link href={`/baustellen/${id}/berichte/${b.id}`} className="flex items-center gap-3 rounded-xl border p-4 transition-colors hover:bg-muted">
                <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{BERICHT_ART_NAMEN[b.art as BerichtArt] ?? b.art} · {formatDatum(b.datum)}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {[wetter, k.wer(b.erstellt_von)].filter(Boolean).join(" · ")}
                  </span>
                  <span className="block text-sm">
                    {b.status === "entwurf" ? (
                      <span className="font-medium text-amber-700">Entwurf</span>
                    ) : (
                      <span className="text-muted-foreground">Abgeschlossen{b.unterschrift_name ? ` · unterschrieben von ${b.unterschrift_name}` : ""}</span>
                    )}
                  </span>
                </span>
                <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
