"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { toast } from "sonner";
import { Auswahl, Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBetrag, formatZahl } from "@/lib/format";
import {
  KOSTENARTEN,
  KOSTENART_NAMEN,
  kalkulieren,
  lohnZuschlagProzent,
  lohngruppeFinden,
  type KalkulationEingabe,
  type KalkulationEinstellungen,
} from "@/lib/kalkulation";
import { kalkulationEingabeSchema } from "@/lib/kalkulation-schema";
import {
  EINHEITEN,
  MAX_PREIS,
  ordnerOptionen,
  preisFuerFeld,
  preisLesen,
  vkBerechnen,
  zuschlagLesen,
  type KatalogArt,
  type OrdnerEintrag,
} from "@/lib/katalog";
import { leistungSchema, materialSchema } from "@/lib/katalog-schema";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { eintragArchivieren, eintragSpeichern } from "./actions";

export type KatalogStart = {
  folderId: string;
  /** Artikelnummer (Material) bzw. Nummer (Leistung) */
  nummer: string;
  name: string;
  /** Beschreibung (Material) bzw. Langtext (Leistung) */
  text: string;
  lieferant: string;
  einheit: string;
  /** Einkaufspreis (Material) bzw. Kosten (Leistung) als Eingabetext */
  preis: string;
  zuschlag: string;
};

/**
 * Material oder Leistung anlegen bzw. ändern (Büro/Admin). Der Verkaufspreis wird live berechnet. Leistungen lassen sich
 * kalkulieren (Lohn + Material + Geräte + Fremdleistung + Sonstiges mit den Zuschlägen aus „Kalkulation“).
 */
export function KatalogFormular({
  art,
  id,
  start,
  ordner,
  archiviert,
  kalkulation,
  kalkulationStart,
}: {
  art: KatalogArt;
  id: string | null;
  start: KatalogStart;
  /** Alle aktiven Ordner dieser Art */
  ordner: OrdnerEintrag[];
  archiviert: boolean;
  /** Einstellungen der Kalkulation (nur bei Leistungen) */
  kalkulation?: KalkulationEinstellungen;
  /** Gespeicherte Zusammensetzung dieser Leistung; leer = Preis von Hand */
  kalkulationStart?: KalkulationEingabe | null;
}) {
  const router = useRouter();
  const istMaterial = art === "material";
  const [w, setW] = useState(start);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const optionen = ordnerOptionen(ordner);

  // Kalkulation (nur Leistungen)
  const kannKalkulieren = !istMaterial && kalkulation != null;
  const [kalkAn, setKalkAn] = useState(kalkulationStart != null);
  const [kw, setKw] = useState(() => {
    const k = kalkulationStart;
    const t = (n: number) => (n ? preisFuerFeld(n) : "");
    return {
      lohngruppeId: k?.lohngruppeId || kalkulation?.lohngruppen[0]?.id || "",
      lohnMinuten: k?.lohnMinuten ? String(k.lohnMinuten).replace(".", ",") : "",
      material: t(k?.material ?? 0),
      geraete: t(k?.geraete ?? 0),
      fremdleistung: t(k?.fremdleistung ?? 0),
      sonstiges: t(k?.sonstiges ?? 0),
    };
  });
  const kPruefung = kalkulationEingabeSchema.safeParse(kw);
  const kErgebnis = kannKalkulieren && kalkAn && kPruefung.success && kalkulation ? kalkulieren(kPruefung.data, kalkulation) : null;
  const gruppe = kalkulation ? lohngruppeFinden(kalkulation, kw.lohngruppeId) : null;

  const f = (feld: keyof KatalogStart) => ({
    value: w[feld],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setW((alt) => ({ ...alt, [feld]: e.target.value }));
      setFehler(null);
    },
  });

  // Live-Vorschau des Verkaufspreises (leer = 0, wie beim Speichern)
  const ek = w.preis.trim() === "" ? 0 : preisLesen(w.preis);
  const zuschlag = w.zuschlag.trim() === "" ? 0 : zuschlagLesen(w.zuschlag);
  const vk = ek != null && ek <= MAX_PREIS && zuschlag != null ? vkBerechnen(ek, zuschlag) : null;

  function eingabe() {
    return istMaterial
      ? { folderId: w.folderId, artikelnr: w.nummer, name: w.name, beschreibung: w.text, lieferant: w.lieferant, einheit: w.einheit, ek: w.preis, zuschlag: w.zuschlag }
      : {
          folderId: w.folderId, nummer: w.nummer, name: w.name, langtext: w.text, einheit: w.einheit, kosten: w.preis, zuschlag: w.zuschlag,
          ...(kannKalkulieren && kalkAn ? { kalkulation: kw } : {}),
        };
  }

  function speichern(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    if (laeuft) return;
    if (kannKalkulieren && kalkAn) {
      if (!kPruefung.success) return setFehler(ersteMeldung(kPruefung.error));
      if (!kErgebnis || kErgebnis.ekGesamt <= 0) return setFehler("Die Kalkulation ergibt keine Kosten. Bitte Lohn oder einen Betrag eintragen.");
    }
    const werte = eingabe();
    const pruefung = (istMaterial ? materialSchema : leistungSchema).safeParse(werte);
    if (!pruefung.success) return setFehler(ersteMeldung(pruefung.error));

    setFehler(null);
    starte(async () => {
      const r = await eintragSpeichern(art, id, werte);
      if (r.fehler) return setFehler(r.fehler);
      toast.success(id ? "Änderung gespeichert." : `${istMaterial ? "Material" : "Leistung"} angelegt.`);
      router.push(`/buero/katalog?art=${art}${w.folderId ? `&ordner=${w.folderId}` : ""}`);
    });
  }

  function archivieren(wert: boolean) {
    if (!id || laeuft) return;
    starte(async () => {
      const r = await eintragArchivieren(art, id, wert);
      if (r.fehler) return setFehler(r.fehler);
      toast.success(wert ? "Archiviert." : "Wiederhergestellt.");
      router.push(`/buero/katalog?art=${art}${w.folderId ? `&ordner=${w.folderId}` : ""}`);
    });
  }

  return (
    <form onSubmit={speichern} className="flex max-w-2xl flex-col gap-5">
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
      {archiviert && <FormularMeldung art="hinweis">Dieser Eintrag ist archiviert. Zum Bearbeiten bitte zuerst wiederherstellen.</FormularMeldung>}

      <Feld label={istMaterial ? "Bezeichnung" : "Kurztext"} htmlFor="name">
        <Input id="name" required maxLength={200} {...f("name")} className="h-11 text-base" />
      </Feld>

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label={istMaterial ? "Artikelnummer (optional)" : "Nummer (optional)"} htmlFor="nummer">
          <Input id="nummer" maxLength={50} {...f("nummer")} className="h-11 text-base" />
        </Feld>
        {istMaterial && (
          <Feld label="Lieferant (optional)" htmlFor="lieferant">
            <Input id="lieferant" maxLength={100} {...f("lieferant")} className="h-11 text-base" />
          </Feld>
        )}
      </div>

      <Feld label={istMaterial ? "Beschreibung (optional)" : "Langtext (optional)"} htmlFor="text"
        hinweis={istMaterial ? undefined : "Erscheint später im Angebot unter dem Kurztext."}>
        <textarea id="text" rows={istMaterial ? 3 : 6} maxLength={istMaterial ? 2000 : 5000} {...f("text")}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      </Feld>

      <div className="grid gap-4 sm:grid-cols-2">
        <Feld label="Ordner" htmlFor="ordner">
          <Auswahl id="ordner" {...f("folderId")}>
            <option value="">Ohne Ordner</option>
            {optionen.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
          </Auswahl>
        </Feld>
        <Feld label="Einheit" htmlFor="einheit" hinweis="z. B. Stk, m², Std. Eigene Einheiten sind möglich.">
          <Input id="einheit" required maxLength={20} list="einheiten" {...f("einheit")} className="h-11 text-base" />
          <datalist id="einheiten">{EINHEITEN[art].map((e) => <option key={e} value={e} />)}</datalist>
        </Feld>
      </div>

      {kannKalkulieren && (
        <label className="flex items-center gap-2 text-base font-medium">
          <input type="checkbox" checked={kalkAn} onChange={(e) => { setKalkAn(e.target.checked); setFehler(null); }} className="size-4 accent-[oklch(0.6_0.135_153)]" />
          Preis kalkulieren (Lohn, Material, Geräte …)
        </label>
      )}

      {kannKalkulieren && kalkAn && kalkulation ? (
        <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
          <legend className="px-1 text-base font-medium">Kalkulation je {w.einheit.trim() || "Einheit"}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Feld label="Lohngruppe" htmlFor="lohngruppe">
              <Auswahl id="lohngruppe" value={kw.lohngruppeId} onChange={(e) => setKw((alt) => ({ ...alt, lohngruppeId: e.target.value }))}>
                {kalkulation.lohngruppen.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Auswahl>
            </Feld>
            <Feld
              label="Lohn (Minuten)"
              htmlFor="lohnminuten"
              hinweis={gruppe ? `${formatBetrag(gruppe.lohnkosten)} Lohnkosten, ${formatBetrag(gruppe.verrechnungssatz)} Verrechnungssatz je Stunde` : undefined}
            >
              <Input id="lohnminuten" inputMode="decimal" placeholder="0" value={kw.lohnMinuten} onChange={(e) => { setKw((alt) => ({ ...alt, lohnMinuten: e.target.value })); setFehler(null); }} className="h-11 text-base" />
            </Feld>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["material", "geraete", "fremdleistung", "sonstiges"] as const).map((a) => (
              <Feld key={a} label={`${KOSTENART_NAMEN[a]} (€, Einkauf)`} htmlFor={`k-${a}`} hinweis={`Zuschlag ${formatZahl(kalkulation.zuschlaege[a])} %`}>
                <Input id={`k-${a}`} inputMode="decimal" placeholder="0,00" value={kw[a]} onChange={(e) => { setKw((alt) => ({ ...alt, [a]: e.target.value })); setFehler(null); }} className="h-11 text-base" />
              </Feld>
            ))}
          </div>

          {kErgebnis ? (
            <div className="overflow-hidden rounded-lg border text-sm">
              <table className="w-full">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Kostenart</th>
                    <th className="px-3 py-1.5 text-right font-medium">Kosten</th>
                    <th className="px-3 py-1.5 text-right font-medium">Zuschlag</th>
                    <th className="px-3 py-1.5 text-right font-medium">VK</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {KOSTENARTEN.map((a) => (
                    <tr key={a}>
                      <td className="px-3 py-1.5">{KOSTENART_NAMEN[a]}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatBetrag(kErgebnis.ek[a])}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatZahl(a === "lohn" ? (gruppe ? lohnZuschlagProzent(gruppe) : 0) : kalkulation.zuschlaege[a])} %</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatBetrag(kErgebnis.vk[a])}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-semibold">
                  <tr>
                    <td className="px-3 py-2">Summe</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBetrag(kErgebnis.ekGesamt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatZahl(kErgebnis.zuschlagProzent)} %</td>
                    <td className="px-3 py-2 text-right tabular-nums" role="status" aria-live="polite">{formatBetrag(kErgebnis.vkGespeichert)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{kPruefung.success ? "" : ersteMeldung(kPruefung.error)}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Gespeichert werden die Kosten (Summe der Einkaufswerte) und der Zuschlag, mit dem der Verkaufspreis auf den kalkulierten Preis kommt.
            {kErgebnis && kErgebnis.vkGespeichert !== kErgebnis.vkGesamt && ` Bei Kosten über 100 € je Einheit kann er um einige Cent abweichen (kalkuliert ${formatBetrag(kErgebnis.vkGesamt)}).`}
          </p>
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
          <legend className="px-1 text-base font-medium">Preis</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Feld label={istMaterial ? "Einkaufspreis (€)" : "Kosten (€)"} htmlFor="preis" hinweis="bis 4 Nachkommastellen, z. B. 12,50">
              <Input id="preis" inputMode="decimal" placeholder="0,00" {...f("preis")} className="h-11 text-base" />
            </Feld>
            <Feld label="Zuschlag (%)" htmlFor="zuschlag" hinweis="z. B. 25 oder 12,5">
              <Input id="zuschlag" inputMode="decimal" placeholder="0" {...f("zuschlag")} className="h-11 text-base" />
            </Feld>
            <div className="flex flex-col gap-2">
              <p className="text-base font-medium">Verkaufspreis (VK)</p>
              <p className="flex h-11 items-center rounded-lg bg-muted px-3 text-lg font-semibold tabular-nums" role="status" aria-live="polite">
                {vk != null ? formatBetrag(vk) : "–"}
              </p>
              <p className="text-sm text-muted-foreground">
                {vk != null && ek != null ? `Aufschlag ${formatBetrag(Math.round((vk - ek) * 100) / 100)}` : "wird berechnet"}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Der Verkaufspreis ist immer Einkaufspreis × (1 + Zuschlag) und wird auf Cent gerundet.</p>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={laeuft || archiviert}>
          {laeuft ? "Speichern …" : id ? "Änderung speichern" : "Speichern"}
        </Button>
        {id && (
          <Button type="button" variant="outline" size="lg" className="ml-auto" disabled={laeuft} onClick={() => archivieren(!archiviert)}>
            {archiviert ? <><ArchiveRestoreIcon /> Wiederherstellen</> : <><ArchiveIcon /> Archivieren</>}
          </Button>
        )}
      </div>
    </form>
  );
}
