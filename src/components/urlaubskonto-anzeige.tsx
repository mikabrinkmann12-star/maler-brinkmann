import type { Urlaubskonto } from "@/lib/urlaub";

/** Kurzübersicht Urlaubsanspruch eines Jahres (Kalenderjahr, ohne Übertrag). */
export function UrlaubskontoAnzeige({ konto, kompakt = false }: { konto: Urlaubskonto; kompakt?: boolean }) {
  if (konto.anspruch == null) {
    return (
      <p className="text-sm text-muted-foreground">
        Urlaub {konto.jahr}: Anspruch noch nicht eingetragen{kompakt ? "" : " (im Büro nachfragen)"}.
      </p>
    );
  }
  if (kompakt) {
    return (
      <p className="text-sm">
        Urlaub {konto.jahr}: <strong>Rest {konto.rest}</strong> von {konto.anspruch} Tagen
        {konto.beantragt > 0 && ` · ${konto.beantragt} beantragt`}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted p-4 text-center">
      <p className="col-span-3 text-left font-semibold">Urlaub {konto.jahr}</p>
      <p><span className="block text-2xl font-semibold">{konto.anspruch}</span><span className="text-sm text-muted-foreground">Anspruch</span></p>
      <p><span className="block text-2xl font-semibold">{konto.genehmigt}</span><span className="text-sm text-muted-foreground">genehmigt</span></p>
      <p><span className="block text-2xl font-semibold">{konto.rest}</span><span className="text-sm text-muted-foreground">Rest</span></p>
      {konto.beantragt > 0 && (
        <p className="col-span-3 text-left text-sm text-muted-foreground">Dazu {konto.beantragt} Tage beantragt (noch offen).</p>
      )}
      <p className="col-span-3 text-left text-xs text-muted-foreground">Werktage Mo–Fr, Feiertage sind noch nicht abgezogen.</p>
    </div>
  );
}
