"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRingIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDatum, formatDatumZeit } from "@/lib/format";
import { MAHNSTUFEN, mahnstufeName } from "@/lib/mahnung";
import { rechnungMailSchema } from "@/lib/rechnung-mail";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { rechnungMahnen, rechnungMahnstufeSetzen } from "../actions";

export type MahnungSenden = {
  an: string;
  /** Vorschlag für Betreff und Text je Mahnstufe (1 bis 3) */
  vorschlaege: Record<number, { betreff: string; text: string }>;
  verlauf: { stufe: number; versendetAn: string | null; versendetAm: string | null }[];
};

/**
 * Mahnung bei einer offenen Rechnung. Mit `senden` (sevdesk im Hintergrund) legt die App die Zahlungserinnerung bzw. Mahnung an und schickt sie per
 * E-Mail; ohne (ältere Lexware-Rechnungen) vermerkt sie nur, wie weit gemahnt wurde, damit die Rechnung auf der Übersicht bei „Angemahnt“ (rot) steht.
 */
export function MahnungKarte({
  rechnungId,
  stufe,
  angemahntAm,
  hinweise,
  senden,
}: {
  rechnungId: string;
  stufe: number;
  angemahntAm: string | null;
  hinweise: Record<number, string>;
  senden?: MahnungSenden;
}) {
  const router = useRouter();
  const [neu, setNeu] = useState(stufe);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const naechste = stufe + 1 <= 3 ? stufe + 1 : null;
  const [mail, setMail] = useState(() => ({ an: senden?.an ?? "", ...(senden && naechste ? senden.vorschlaege[naechste] : { betreff: "", text: "" }) }));
  const [frage, setFrage] = useState(false);

  function vermerken() {
    setFehler(null);
    starte(async () => {
      const r = await rechnungMahnstufeSetzen(rechnungId, neu);
      if (r.fehler) return setFehler(r.fehler);
      toast.success(neu === 0 ? "Mahnvermerk entfernt." : `„${mahnstufeName(neu)}“ vermerkt.`);
      router.refresh();
    });
  }

  function pruefen() {
    const p = rechnungMailSchema.safeParse(mail);
    if (!p.success) return setFehler(ersteMeldung(p.error));
    setFehler(null);
    setFrage(true);
  }

  function mahnen() {
    if (!naechste) return;
    setFehler(null);
    starte(async () => {
      const r = await rechnungMahnen(rechnungId, naechste, mail);
      setFrage(false);
      if (r.fehler) {
        setFehler(r.fehler);
        router.refresh();
        return;
      }
      toast.success(`${mahnstufeName(naechste)} gesendet`);
      router.refresh();
    });
  }

  const feld = (name: "an" | "betreff" | "text") => ({
    value: mail[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setMail((alt) => ({ ...alt, [name]: e.target.value }));
      setFehler(null);
      setFrage(false);
    },
  });

  const vermerk = (
    <div className="flex flex-wrap items-center gap-2">
      <select value={neu} onChange={(e) => setNeu(Number(e.target.value))} aria-label="Mahnstufe" className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
        {MAHNSTUFEN.map((m) => <option key={m.stufe} value={m.stufe}>{m.name}</option>)}
      </select>
      <Button type="button" variant="outline" disabled={laeuft || neu === stufe} onClick={vermerken}>{laeuft ? "Speichert …" : "Vermerken"}</Button>
    </div>
  );

  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <BellRingIcon className={stufe > 0 ? "size-4 text-red-600" : "size-4"} /> Mahnung
        {stufe > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{mahnstufeName(stufe)}{angemahntAm ? ` · ${formatDatum(angemahntAm)}` : ""}</span>}
      </h2>
      {fehler && <FormularMeldung>{fehler}</FormularMeldung>}

      {senden ? (
        <>
          {senden.verlauf.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              {senden.verlauf.map((v, i) => (
                <li key={i}>{mahnstufeName(v.stufe)}{v.versendetAm ? ` am ${formatDatumZeit(v.versendetAm)}` : " (nicht gesendet)"}{v.versendetAn ? ` an ${v.versendetAn}` : ""}</li>
              ))}
            </ul>
          )}
          {naechste ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Nächster Schritt: <strong>{mahnstufeName(naechste)}</strong>. Die App legt sie an und schickt sie per E-Mail an den Kunden.
                {hinweise[naechste] && <> {hinweise[naechste]}.</>}
              </p>
              <Feld label="An" htmlFor="mahn-an"><Input id="mahn-an" type="email" inputMode="email" maxLength={320} className="h-11" {...feld("an")} /></Feld>
              <Feld label="Betreff" htmlFor="mahn-betreff"><Input id="mahn-betreff" maxLength={200} className="h-11" {...feld("betreff")} /></Feld>
              <Feld label="Text" htmlFor="mahn-text"><Textarea id="mahn-text" rows={8} maxLength={5000} {...feld("text")} /></Feld>
              <div className="flex flex-wrap items-center gap-2">
                {frage ? (
                  <>
                    <Button type="button" onClick={mahnen} disabled={laeuft}><SendIcon /> {laeuft ? "Wird gesendet …" : `Ja, ${mahnstufeName(naechste)} an ${mail.an} senden`}</Button>
                    <Button type="button" variant="ghost" onClick={() => setFrage(false)} disabled={laeuft}>Abbrechen</Button>
                  </>
                ) : (
                  <Button type="button" variant="outline" onClick={pruefen}><SendIcon /> {mahnstufeName(naechste)} prüfen und senden</Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Alle Mahnstufen sind durch. Weitere Schritte (Inkasso, gerichtliches Mahnverfahren) bespricht ihr mit dem Steuerberater.</p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Nur vermerken (z. B. telefonisch erinnert)</summary>
            <div className="pt-2">{vermerk}</div>
          </details>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Mahnungen schreibst du in Lexware. Hier vermerkst du nur, wie weit gemahnt wurde, damit die Rechnung auf der Übersicht bei „Angemahnt“ (rot) steht.
          </p>
          {hinweise[neu] && <p className="text-sm">{hinweise[neu]}</p>}
          {vermerk}
        </>
      )}
    </section>
  );
}
