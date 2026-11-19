"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { KontaktVorschlag } from "@/lib/anfrage";
import { anfrageAnnehmen } from "./actions";

export type DublettenAnzeige = { id: string; name: string; grund: string };

const feld = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const FELDER: { name: keyof Omit<KontaktVorschlag, "notizen">; titel: string; max: number; typ?: string }[] = [
  { name: "anrede", titel: "Anrede", max: 100 },
  { name: "vorname", titel: "Vorname", max: 80 },
  { name: "nachname", titel: "Nachname *", max: 80 },
  { name: "strasse", titel: "Straße und Hausnummer", max: 120 },
  { name: "plz", titel: "PLZ", max: 10 },
  { name: "ort", titel: "Ort", max: 80 },
  { name: "telefon", titel: "Telefon", max: 40, typ: "tel" },
  { name: "email", titel: "E-Mail", max: 200, typ: "email" },
];

/**
 * „Annehmen“: Fenster mit den vorbefüllten Kontaktfeldern. Gibt es den Kunden vermutlich schon (gleiche E-Mail, Telefonnummer oder
 * Name + Adresse), wird zuerst gefragt: vorhandenen Kontakt verknüpfen oder trotzdem neu anlegen.
 */
export function AnfrageAnnehmen({ anfrageId, vorschlag, dubletten, darfAnlegen }: { anfrageId: string; vorschlag: KontaktVorschlag; dubletten: DublettenAnzeige[]; darfAnlegen: boolean }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [werte, setWerte] = useState<KontaktVorschlag>(vorschlag);
  const [neuAnlegen, setNeuAnlegen] = useState(dubletten.length === 0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function senden(eingabe: Parameters<typeof anfrageAnnehmen>[0]) {
    if (laeuft) return;
    starte(async () => {
      setFehler(null);
      try {
        const r = await anfrageAnnehmen(eingabe);
        if (r.fehler) return void setFehler(r.fehler);
        toast.success("Anfrage angenommen.", {
          action: r.kontaktId ? { label: "Kontakt öffnen", onClick: () => router.push(`/buero/kontakte/${r.kontaktId}`) } : undefined,
        });
        setOffen(false);
        router.refresh();
      } catch {
        setFehler("Keine Verbindung. Bitte nochmal versuchen.");
      }
    });
  }

  return (
    <Dialog
      open={offen}
      onOpenChange={(o) => {
        setOffen(o);
        if (o) {
          setWerte(vorschlag);
          setNeuAnlegen(dubletten.length === 0);
          setFehler(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <CheckIcon /> Annehmen
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Anfrage annehmen</DialogTitle>
          <DialogDescription>Daraus wird ein Kontakt (Privatkunde). Die Kundennummer wird automatisch vergeben.</DialogDescription>
        </DialogHeader>

        {!neuAnlegen ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
              Gibt es schon: {dubletten.length === 1 ? dubletten[0].name : `${dubletten.length} passende Kontakte`}. Vorhandenen Kontakt verknüpfen oder trotzdem neu anlegen?
            </p>
            <ul className="flex flex-col gap-2">
              {dubletten.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/buero/kontakte/${d.id}`} target="_blank" className="font-medium underline">{d.name}</Link>
                    <p className="text-xs text-muted-foreground">{d.grund}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={laeuft} onClick={() => senden({ id: anfrageId, kontaktId: d.id })}>
                    Verknüpfen
                  </Button>
                </li>
              ))}
            </ul>
            {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
            <DialogFooter>
              {darfAnlegen && (
                <Button type="button" variant="ghost" disabled={laeuft} onClick={() => setNeuAnlegen(true)}>
                  <UserPlusIcon /> Trotzdem neu anlegen
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              senden({ id: anfrageId, kontakt: werte });
            }}
            className="flex flex-col gap-3"
          >
            {!darfAnlegen && <p className="text-sm text-destructive">Neue Kontakte darfst du nicht anlegen.</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FELDER.map((f) => (
                <label key={f.name} className={`flex flex-col gap-1 text-xs text-muted-foreground ${f.name === "strasse" || f.name === "email" ? "sm:col-span-2" : ""}`}>
                  {f.titel}
                  <input
                    type={f.typ ?? "text"}
                    maxLength={f.max}
                    required={f.name === "nachname"}
                    value={werte[f.name]}
                    onChange={(e) => setWerte((w) => ({ ...w, [f.name]: e.target.value }))}
                    className={feld}
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                Notizen
                <textarea
                  rows={5}
                  maxLength={2000}
                  value={werte.notizen}
                  onChange={(e) => setWerte((w) => ({ ...w, notizen: e.target.value }))}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </label>
            </div>
            {fehler && <p role="alert" className="text-sm text-destructive">{fehler}</p>}
            <DialogFooter>
              {dubletten.length > 0 && (
                <Button type="button" variant="ghost" disabled={laeuft} onClick={() => setNeuAnlegen(false)}>
                  Zurück zu den Treffern
                </Button>
              )}
              <Button type="submit" disabled={laeuft || !darfAnlegen}>
                <UserPlusIcon /> {laeuft ? "Wird angelegt …" : "Kontakt anlegen und annehmen"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
