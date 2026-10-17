import { ClipboardListIcon, PackageCheckIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AnweisungAnzeige } from "./anweisung-anzeige";
import { AnweisungBearbeiten } from "./anweisung-bearbeiten";
import { ListeAnlegen } from "./liste-anlegen";

type ListenArt = "arbeitsanweisung" | "materialliste";

const TEXTE: Record<ListenArt, { titel: string; anker: string; leer: string; hinweisBuero: string }> = {
  arbeitsanweisung: {
    titel: "Arbeitsanweisung",
    anker: "arbeitsanweisung",
    leer: "Noch keine Arbeitsanweisung.",
    hinweisBuero: "Öffne das Angebot und tippe auf „Arbeitsanweisung erstellen“, oder lege hier eine leere an.",
  },
  materialliste: {
    titel: "Materialliste",
    anker: "materialliste",
    leer: "Noch keine Materialliste.",
    hinweisBuero: "Öffne das Angebot und tippe auf „Materialliste erstellen“ (aus den Material-Positionen), oder lege hier eine leere an und schreibe die Zeilen selbst.",
  },
};

/**
 * Arbeitsanweisung oder Materialliste des Projekts (Stichpunkte, ohne Preise). Mitarbeiter sehen nur freigegebene
 * (Regel in der Datenbank), das Büro sieht alle, kann sie bearbeiten, freigeben und von Hand ergänzen.
 */
export async function Projektliste({ projektId, art, istBuero, archiviert }: { projektId: string; art: ListenArt; istBuero: boolean; archiviert: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("work_instructions")
    .select("id, titel, inhalt, freigegeben_am")
    .eq("project_id", projektId)
    .eq("art", art)
    .is("archiviert_am", null)
    .order("created_at", { ascending: false });
  const listen = data ?? [];
  const t = TEXTE[art];
  const Symbol = art === "materialliste" ? PackageCheckIcon : ClipboardListIcon;

  return (
    <section id={t.anker} className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Symbol className="size-5" /> {t.titel}</h2>
      {listen.length === 0 ? (
        <>
          <p className="text-muted-foreground">{istBuero ? `${t.leer} ${t.hinweisBuero}` : t.leer}</p>
          {istBuero && !archiviert && <ListeAnlegen projektId={projektId} art={art} />}
        </>
      ) : (
        listen.map((a) => (
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
