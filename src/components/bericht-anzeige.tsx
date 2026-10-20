import { CheckSquareIcon, SquareIcon } from "lucide-react";
import { BERICHT_DEFS, type BerichtArt } from "@/lib/bericht-arten";
import { eintragsZeile, wetterText, type BerichtDaten, type EintragWerte } from "@/lib/bericht";
import { formatDatum } from "@/lib/format";

export type AnzeigeInfo = {
  auftragnehmer: string;
  auftraggeber: string;
  projekt: string;
  leistungsort: string;
  erstelltVon: string;
};
export type AnzeigeFoto = { id: string; vorschauUrl: string | null; bildUrl: string | null };

function Zeile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line text-base">{children}</dd>
    </div>
  );
}

/** Ein Bericht zum Lesen: „Allgemeine Informationen“ und alle Abschnitte (ohne Eingabefelder). Für Vorschau und fertige Berichte. */
export function BerichtAnzeige({
  art,
  datum,
  daten,
  info,
  personName,
  fotos,
}: {
  art: BerichtArt;
  datum: string;
  daten: BerichtDaten;
  info: AnzeigeInfo;
  personName: (id: string) => string;
  fotos: AnzeigeFoto[];
}) {
  const def = BERICHT_DEFS[art];
  const a = daten.allgemein;
  const wetter = wetterText(a.wetter, a.temperatur);
  const fotoNach = new Map(fotos.map((f) => [f.id, f]));

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Allgemeine Informationen</h2>
        <dl className="flex flex-col gap-3">
          {info.auftragnehmer && <Zeile label="Auftragnehmer">{info.auftragnehmer}</Zeile>}
          {info.auftraggeber && <Zeile label="Auftraggeber">{info.auftraggeber}</Zeile>}
          <Zeile label="Projektname">{info.projekt}</Zeile>
          {info.leistungsort && <Zeile label="Leistungsort">{info.leistungsort}</Zeile>}
          <Zeile label="Datum">{formatDatum(datum)}</Zeile>
          {def.allgemein.zeitraum && (a.von || a.bis) && (
            <Zeile label="Leistungszeitraum">{[a.von && formatDatum(a.von), a.bis && formatDatum(a.bis)].filter(Boolean).join(" – ")}</Zeile>
          )}
          {def.allgemein.wetter && wetter && <Zeile label="Wetterbedingung">{wetter}</Zeile>}
          {info.erstelltVon && <Zeile label="Erstellt von">{info.erstelltVon}</Zeile>}
        </dl>
      </section>

      {def.abschnitte
        .filter((ab) => ab.id !== "allgemein")
        .map((ab) => (
          <section key={ab.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <h2 className="font-semibold">{ab.titel}</h2>
            {ab.felder.map((f) => {
              if (f.art === "festtext") return <p key={f.schluessel} className="text-base">{f.text}</p>;
              const w = daten.werte[f.schluessel];
              if (f.art === "text") return <p key={f.schluessel} className="whitespace-pre-line text-base">{String(w ?? "") || "–"}</p>;
              if (f.art === "auswahl") return <p key={f.schluessel} className="text-base">{f.optionen.find((o) => o.wert === w)?.name ?? "–"}</p>;
              if (f.art === "checkliste") {
                const an = Array.isArray(w) ? (w as string[]) : [];
                return (
                  <ul key={f.schluessel} className="flex flex-col gap-1.5">
                    {f.punkte.map((p) => (
                      <li key={p.wert} className="flex items-center gap-2">
                        {an.includes(p.wert) ? <CheckSquareIcon className="size-5 text-primary" /> : <SquareIcon className="size-5 text-muted-foreground" />}
                        <span>{p.name}</span>
                      </li>
                    ))}
                  </ul>
                );
              }
              if (f.art === "liste") {
                const eintraege = Array.isArray(w) ? (w as EintragWerte[]) : [];
                if (!eintraege.length) return <p key={f.schluessel} className="text-muted-foreground">Keine Einträge.</p>;
                return (
                  <ul key={f.schluessel} className="flex flex-col divide-y">
                    {eintraege.map((e, i) => {
                      const z = eintragsZeile(f, e, personName, formatDatum);
                      return (
                        <li key={i} className="py-2 first:pt-0 last:pb-0">
                          <p className="whitespace-pre-line font-medium">{z.titel}</p>
                          {z.zusatz.map((t, n) => <p key={n} className="whitespace-pre-line text-sm text-muted-foreground">{t}</p>)}
                        </li>
                      );
                    })}
                  </ul>
                );
              }
              if (f.art === "bilder") {
                const ids = Array.isArray(w) ? (w as string[]) : [];
                const bilder = ids.map((id) => fotoNach.get(id)).filter((x): x is AnzeigeFoto => Boolean(x));
                if (!bilder.length) return <p key={f.schluessel} className="text-muted-foreground">Keine Bilder.</p>;
                return (
                  <ul key={f.schluessel} className="grid grid-cols-2 gap-2">
                    {bilder.map((b) => (
                      <li key={b.id}>
                        <a href={b.bildUrl ?? undefined} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border">
                          {b.vorschauUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={b.vorschauUrl} alt="Foto zum Bericht" className="size-full object-cover" />
                          )}
                        </a>
                      </li>
                    ))}
                  </ul>
                );
              }
              // zahl, datum, person (einzeln, außerhalb von Listen: gibt es zurzeit nicht)
              return <p key={f.schluessel}>{String(w ?? "") || "–"}</p>;
            })}
          </section>
        ))}
    </div>
  );
}

