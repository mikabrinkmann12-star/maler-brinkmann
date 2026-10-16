import { anweisungBlocks } from "@/lib/arbeitsanweisung";

/** Arbeitsanweisung als Stichpunkte darstellen (ohne Preise, der Text kommt schon ohne sie aus der Datenbank). */
export function AnweisungAnzeige({ inhalt }: { inhalt: string }) {
  const bloecke = anweisungBlocks(inhalt);
  return (
    <div className="flex flex-col gap-1 text-base">
      {bloecke.map((b, i) => {
        if (b.art === "leer") return <div key={i} className="h-2" />;
        if (b.art === "ueberschrift") return <h3 key={i} className="mt-2 text-lg font-semibold">{b.text}</h3>;
        if (b.art === "punkt") return <p key={i} className="flex gap-2"><span aria-hidden>•</span><span>{b.text}</span></p>;
        if (b.art === "unterpunkt") return <p key={i} className="ml-6 flex gap-2 text-muted-foreground"><span aria-hidden>–</span><span>{b.text}</span></p>;
        return <p key={i} className="text-muted-foreground">{b.text}</p>;
      })}
    </div>
  );
}
