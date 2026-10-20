import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, FilePlus2Icon } from "lucide-react";
import { BERICHT_ART_NAMEN, istBerichtArt } from "@/lib/bericht";
import { berichtKontext } from "@/lib/bericht-daten";
import { heuteIso, tageVerschieben } from "@/lib/datum";
import { formatDatum, formatUhrzeit } from "@/lib/format";
import { kalenderwoche } from "@/lib/kalenderwoche";
import { wochenstart } from "@/lib/woche";

export const metadata: Metadata = { title: "Berichte" };

/** „KW 43 · Aktuelle Woche“ bzw. „KW 42 · 12.–18.10.2026“ */
function wochenUeberschrift(montag: string, aktuellerMontag: string): string {
  const kw = `KW ${kalenderwoche(montag)}`;
  if (montag === aktuellerMontag) return `${kw} · Aktuelle Woche`;
  const sonntag = tageVerschieben(montag, 6);
  return `${kw} · ${formatDatum(montag).slice(0, 6)}–${formatDatum(sonntag)}`;
}

// Reiter „Berichte“: nach Kalenderwoche gruppiert, unten rechts „Bericht erstellen“.
export default async function BerichteSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const k = await berichtKontext(id);
  const { data } = await k.supabase
    .from("project_reports")
    .select("id, art, datum, status, erstellt_von, unterschrift_name, created_at, updated_at")
    .eq("project_id", id)
    .is("archiviert_am", null)
    .order("datum", { ascending: false })
    .order("created_at", { ascending: false });
  const berichte = data ?? [];
  const aktuellerMontag = wochenstart(heuteIso());

  const gruppen: { montag: string; berichte: typeof berichte }[] = [];
  for (const b of berichte) {
    const montag = wochenstart(b.datum);
    const letzte = gruppen[gruppen.length - 1];
    if (letzte?.montag === montag) letzte.berichte.push(b);
    else gruppen.push({ montag, berichte: [b] });
  }

  const heute = heuteIso();
  const zeitText = (b: (typeof berichte)[number]) => {
    const tag = b.created_at.slice(0, 10);
    const wann = tag === heute ? "Heute" : formatDatum(tag);
    return [wann, formatUhrzeit(b.created_at), k.wer(b.erstellt_von)].join(" · ");
  };

  return (
    <div className="flex flex-col gap-4">
      {berichte.length === 0 && <p className="rounded-xl border border-dashed p-5 text-muted-foreground">Noch keine Berichte.</p>}
      {gruppen.map((g) => (
        <section key={g.montag} className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">{wochenUeberschrift(g.montag, aktuellerMontag)}</h2>
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
            {g.berichte.map((b) => (
              <li key={b.id}>
                <Link href={`/baustellen/${id}/berichte/${b.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{istBerichtArt(b.art) ? BERICHT_ART_NAMEN[b.art] : b.art} - {formatDatum(b.datum)}</span>
                      {b.status === "entwurf" ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">Entwurf</span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Abgeschlossen</span>
                      )}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {zeitText(b)}
                      {b.unterschrift_name ? ` · unterschrieben von ${b.unterschrift_name}` : ""}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {k.darfSchreiben && (
        <Link
          href={`/baustellen/${id}/berichte/neu`}
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 flex h-14 items-center gap-2 rounded-full bg-primary px-5 font-medium text-primary-foreground shadow-lg active:scale-95"
        >
          <FilePlus2Icon className="size-5" /> Bericht erstellen
        </Link>
      )}
    </div>
  );
}
