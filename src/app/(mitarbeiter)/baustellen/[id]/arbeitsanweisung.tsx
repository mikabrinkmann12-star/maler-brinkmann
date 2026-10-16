import { ClipboardListIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AnweisungAnzeige } from "./anweisung-anzeige";
import { AnweisungBearbeiten } from "./anweisung-bearbeiten";

/**
 * Arbeitsanweisung des Projekts (Stichpunkte aus dem Angebot, ohne Preise).
 * Mitarbeiter sehen nur freigegebene (Regel in der Datenbank), das Büro sieht alle und kann sie bearbeiten.
 */
export async function Arbeitsanweisung({ projektId, istBuero }: { projektId: string; istBuero: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("work_instructions")
    .select("id, titel, inhalt, freigegeben_am")
    .eq("project_id", projektId)
    .is("archiviert_am", null)
    .order("created_at", { ascending: false });
  const anweisungen = data ?? [];
  if (anweisungen.length === 0 && !istBuero) return null;

  return (
    <section id="arbeitsanweisung" className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardListIcon className="size-5" /> Arbeitsanweisung</h2>
      {anweisungen.length === 0 ? (
        <p className="text-muted-foreground">Noch keine Arbeitsanweisung. Öffne das Angebot und tippe auf „Arbeitsanweisung erstellen“.</p>
      ) : (
        anweisungen.map((a) => (
          <div key={a.id} className="flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{a.titel}</h3>
              {istBuero && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${a.freigegeben_am ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
                  {a.freigegeben_am ? "Für Mitarbeiter freigegeben" : "Entwurf: Mitarbeiter sehen das noch nicht"}
                </span>
              )}
            </div>
            <AnweisungAnzeige inhalt={a.inhalt} />
            {istBuero && (
              <details className="rounded-lg border bg-muted/30 p-2">
                <summary className="cursor-pointer text-sm font-medium">Bearbeiten und freigeben</summary>
                <div className="pt-3">
                  <AnweisungBearbeiten key={`${a.id}:${a.titel}|${a.inhalt}|${a.freigegeben_am}`} id={a.id} titel={a.titel} inhalt={a.inhalt} freigegeben={Boolean(a.freigegeben_am)} />
                </div>
              </details>
            )}
          </div>
        ))
      )}
    </section>
  );
}
