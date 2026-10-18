"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalculatorIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { KOSTENART_NAMEN, lohnZuschlagProzent, type KalkulationEinstellungen } from "@/lib/kalkulation";
import { preisFuerFeld, preisLesen } from "@/lib/katalog";
import { formatZahl } from "@/lib/format";
import { kalkulationSpeichern } from "./actions";

type GruppeText = { id: string; name: string; lohnkosten: string; verrechnungssatz: string };
type Entwurf = { material: string; geraete: string; fremdleistung: string; sonstiges: string; lohngruppen: GruppeText[] };

const prozentText = (n: number) => String(n).replace(".", ",");
const EINGABE = "h-8 w-full rounded-md border border-border bg-white px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:bg-muted/50";

function entwurfAus(e: KalkulationEinstellungen): Entwurf {
  return {
    material: prozentText(e.zuschlaege.material),
    geraete: prozentText(e.zuschlaege.geraete),
    fremdleistung: prozentText(e.zuschlaege.fremdleistung),
    sonstiges: prozentText(e.zuschlaege.sonstiges),
    lohngruppen: e.lohngruppen.map((g) => ({ id: g.id, name: g.name, lohnkosten: preisFuerFeld(g.lohnkosten), verrechnungssatz: preisFuerFeld(g.verrechnungssatz) })),
  };
}

/**
 * Seitenfenster „Kalkulation“ wie in Plancraft: erklärt, wie die Preise entstehen (Leistung = Lohn + Material + Geräte + Fremdleistung
 * + Sonstiges), und zeigt die Zuschläge je Kostenart und die Lohngruppen. Büro liest, nur der Admin ändert.
 */
export function KalkulationFenster({ einstellungen, istAdmin }: { einstellungen: KalkulationEinstellungen; istAdmin: boolean }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [w, setW] = useState<Entwurf>(() => entwurfAus(einstellungen));
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function oeffnen(neu: boolean) {
    if (neu) {
      setW(entwurfAus(einstellungen));
      setFehler(null);
    }
    setOffen(neu);
  }

  function gruppeAendern(i: number, teil: Partial<GruppeText>) {
    setW((alt) => ({ ...alt, lohngruppen: alt.lohngruppen.map((g, j) => (j === i ? { ...g, ...teil } : g)) }));
    setFehler(null);
  }

  function speichern() {
    setFehler(null);
    starte(async () => {
      const r = await kalkulationSpeichern(w);
      if (r.fehler) return setFehler(r.fehler);
      toast.success("Kalkulation gespeichert. Sie gilt für Leistungen, die du ab jetzt kalkulierst oder neu speicherst.");
      setOffen(false);
      router.refresh();
    });
  }

  const zuschlag = (feld: "material" | "geraete" | "fremdleistung" | "sonstiges") => (
    <div key={feld} className="flex items-center gap-3">
      <span className="flex-1 text-[13px]">{KOSTENART_NAMEN[feld]}</span>
      {istAdmin ? (
        <label className="flex items-center gap-1.5">
          <input aria-label={`Zuschlag ${KOSTENART_NAMEN[feld]} in Prozent`} inputMode="decimal" value={w[feld]} onChange={(e) => { setW((alt) => ({ ...alt, [feld]: e.target.value })); setFehler(null); }} className={`${EINGABE} w-20 text-right`} />
          <span className="text-[13px] text-muted-foreground">%</span>
        </label>
      ) : (
        <span className="text-[13px] font-medium tabular-nums">{formatZahl(einstellungen.zuschlaege[feld])} %</span>
      )}
    </div>
  );

  return (
    <Sheet open={offen} onOpenChange={oeffnen}>
      <SheetTrigger render={<Button type="button" variant="outline" className="h-8 px-3 text-[13px]" />}>
        <CalculatorIcon className="size-3.5" /> Kalkulation
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Kalkulation</SheetTitle>
          <SheetDescription>So entstehen deine Preise.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-[13px]">
            <p className="font-medium">Leistung = Lohn + Material + Geräte + Fremdleistung + Sonstiges</p>
            <p className="mt-1 text-muted-foreground">
              Beim Lohn zählt die Zeit mal der Verrechnungssatz der Lohngruppe. Alle anderen Kostenarten bekommen ihren eigenen Zuschlag auf den Einkaufswert.
              Die Summe ist der Verkaufspreis (VK). Eine Leistung kalkulierst du beim Anlegen unter „Preis kalkulieren“.
            </p>
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold">Zuschläge</h3>
            <div className="flex items-center gap-3">
              <span className="flex-1 text-[13px]">Lohn</span>
              <span className="text-xs text-muted-foreground">ergibt sich aus der Lohngruppe</span>
            </div>
            {(["material", "geraete", "fremdleistung", "sonstiges"] as const).map(zuschlag)}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold">Lohngruppen</h3>
            <p className="text-xs text-muted-foreground">Lohnkosten = was eine Stunde dich kostet. Verrechnungssatz = was du dem Kunden für eine Stunde berechnest (Euro je Stunde).</p>
            <ul className="flex flex-col gap-2">
              {(istAdmin ? w.lohngruppen : einstellungen.lohngruppen.map((g) => ({ id: g.id, name: g.name, lohnkosten: preisFuerFeld(g.lohnkosten), verrechnungssatz: preisFuerFeld(g.verrechnungssatz) }))).map((g, i) => {
                const lk = preisLesen(g.lohnkosten) ?? 0;
                const vs = preisLesen(g.verrechnungssatz) ?? 0;
                return (
                  <li key={g.id || i} className="flex flex-col gap-2 rounded-lg border bg-white p-2.5">
                    <div className="flex items-center gap-2">
                      <input aria-label="Name der Lohngruppe" disabled={!istAdmin} value={g.name} maxLength={60} onChange={(e) => gruppeAendern(i, { name: e.target.value })} placeholder="Name" className={`${EINGABE} font-medium`} />
                      {istAdmin && w.lohngruppen.length > 1 && (
                        <button type="button" aria-label={`Lohngruppe ${g.name || i + 1} entfernen`} onClick={() => setW((alt) => ({ ...alt, lohngruppen: alt.lohngruppen.filter((_, j) => j !== i) }))} className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive">
                          <Trash2Icon className="size-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Lohnkosten €/h
                        <input inputMode="decimal" disabled={!istAdmin} value={g.lohnkosten} onChange={(e) => gruppeAendern(i, { lohnkosten: e.target.value })} className={`${EINGABE} text-right`} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Verrechnungssatz €/h
                        <input inputMode="decimal" disabled={!istAdmin} value={g.verrechnungssatz} onChange={(e) => gruppeAendern(i, { verrechnungssatz: e.target.value })} className={`${EINGABE} text-right`} />
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">Zuschlag auf den Lohn: {formatZahl(lohnZuschlagProzent({ lohnkosten: lk, verrechnungssatz: vs }))} %</p>
                  </li>
                );
              })}
            </ul>
            {istAdmin && w.lohngruppen.length < 10 && (
              <button type="button" onClick={() => setW((alt) => ({ ...alt, lohngruppen: [...alt.lohngruppen, { id: "", name: "", lohnkosten: "", verrechnungssatz: "" }] }))} className="flex w-fit items-center gap-1 text-[13px] font-medium hover:underline">
                <PlusIcon className="size-3.5" /> Lohngruppe hinzufügen
              </button>
            )}
          </section>

          {fehler && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{fehler}</p>}
          {istAdmin ? (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="h-8 px-3 text-[13px]" onClick={() => setOffen(false)}>Abbrechen</Button>
              <Button type="button" className="h-8 px-3 text-[13px]" disabled={laeuft} onClick={speichern}>{laeuft ? "Speichern …" : "Speichern"}</Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nur der Admin kann die Kalkulation ändern.</p>
          )}
          <p className="text-xs text-muted-foreground">Bereits gespeicherte Leistungen behalten ihren Preis, bis du sie neu speicherst.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
