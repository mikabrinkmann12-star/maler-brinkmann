"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, EyeIcon, EyeOffIcon, MailIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Feld } from "@/components/feld";
import { FormularMeldung } from "@/components/formular-meldung";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { mailSchema } from "@/lib/angebot-mail";
import { formatDatumZeit } from "@/lib/format";
import { ersteMeldung } from "@/lib/nutzer-schema";
import { angebotMailSenden } from "../mail-actions";

/** Angebot als PDF per E-Mail senden. Vorbelegt mit der E-Mail-Adresse des Kunden und der Vorlage aus den Einstellungen. */
export function MailPanel({
  angebotId,
  bereit,
  istEntwurf,
  start,
  zuletzt,
  oeffnung,
}: {
  angebotId: string;
  /** Sind die SMTP-Zugangsdaten eingerichtet? */
  bereit: boolean;
  istEntwurf: boolean;
  start: { an: string; betreff: string; text: string };
  zuletzt: { am: string; an: string } | null;
  /** Wann der Kunde die Online-Ansicht geöffnet hat (leer = noch nicht) */
  oeffnung: { erstAm: string | null; zuletztAm: string | null; anzahl: number; pdfAm: string | null } | null;
}) {
  const router = useRouter();
  const [w, setW] = useState(start);
  const [pdfAnhaengen, setPdfAnhaengen] = useState(false);
  const [frage, setFrage] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  const f = (name: keyof typeof start) => ({
    value: w[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setW((alt) => ({ ...alt, [name]: e.target.value }));
      setFehler(null);
      setFrage(false);
    },
  });

  function senden() {
    const pruefung = mailSchema.safeParse({ ...w, pdfAnhaengen });
    if (!pruefung.success) return setFehler(ersteMeldung(pruefung.error));
    setFehler(null);
    starte(async () => {
      const r = await angebotMailSenden(angebotId, pruefung.data);
      if (r.fehler) return setFehler(r.fehler);
      setFrage(false);
      toast.success(`E-Mail an ${r.gesendetAn} gesendet`);
      router.refresh();
    });
  }

  return (
    <details className="rounded-xl border p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-lg font-semibold">
        <MailIcon className="size-5" /> Per E-Mail senden
        {zuletzt && <span className="text-sm font-normal text-muted-foreground">zuletzt am {formatDatumZeit(zuletzt.am)} an {zuletzt.an}</span>}
      </summary>
      {zuletzt && (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          {oeffnung?.erstAm ? (
            <>
              <EyeIcon className="size-4 text-green-700" />
              <span>
                <strong>Vom Kunden geöffnet</strong> am {formatDatumZeit(oeffnung.erstAm)}
                {oeffnung.anzahl > 1 && ` (${oeffnung.anzahl}× angesehen, zuletzt ${formatDatumZeit(oeffnung.zuletztAm ?? oeffnung.erstAm)})`}
                {oeffnung.pdfAm && `, PDF geladen ${formatDatumZeit(oeffnung.pdfAm)}`}
              </span>
            </>
          ) : (
            <>
              <EyeOffIcon className="size-4 text-muted-foreground" />
              <span>Noch nicht geöffnet. Sobald der Kunde den Link öffnet, steht das hier und du bekommst einen Hinweis.</span>
            </>
          )}
        </p>
      )}
      <div className="flex flex-col gap-4 pt-4">
        {!bereit && (
          <FormularMeldung art="hinweis">
            Der E-Mail-Versand ist noch nicht eingerichtet. Der Admin trägt dafür die SMTP-Zugangsdaten (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD) in Vercel ein.
            Bis dahin: PDF herunterladen und von Hand verschicken.
          </FormularMeldung>
        )}
        {fehler && <FormularMeldung>{fehler}</FormularMeldung>}
        <Feld label="An" htmlFor="mail-an" hinweis="Eine E-Mail-Adresse. Sie kommt vom Kunden, wenn dort eine hinterlegt ist.">
          <Input id="mail-an" type="email" inputMode="email" maxLength={320} className="h-12 text-base" {...f("an")} />
        </Feld>
        <Feld label="Betreff" htmlFor="mail-betreff">
          <Input id="mail-betreff" maxLength={200} className="h-12 text-base" {...f("betreff")} />
        </Feld>
        <Feld label="Text" htmlFor="mail-text" hinweis="Unter dem Text steht der grüne Knopf „Ihr Angebot ansehen“ mit dem Link zur Online-Ansicht (PDF ansehen und herunterladen). Der Link gilt 90 Tage.">
          <Textarea id="mail-text" rows={9} maxLength={5000} {...f("text")} />
        </Feld>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pdfAnhaengen} onChange={(e) => { setPdfAnhaengen(e.target.checked); setFrage(false); }} />
          Zusätzlich das PDF an die E-Mail anhängen
        </label>
        {istEntwurf && <p className="text-sm text-muted-foreground">Beim Senden wird das Angebot auf „Versendet“ gesetzt und damit gesperrt. Schlägt der Versand fehl, bleibt es ein Entwurf.</p>}
        <div className="flex flex-wrap items-center gap-2">
          {frage ? (
            <>
              <Button type="button" onClick={senden} disabled={laeuft || !bereit}><SendIcon /> {laeuft ? "Wird gesendet …" : `Ja, an ${w.an} senden`}</Button>
              <Button type="button" variant="ghost" onClick={() => setFrage(false)} disabled={laeuft}>Abbrechen</Button>
            </>
          ) : (
            <Button type="button" onClick={() => { const p = mailSchema.safeParse({ ...w, pdfAnhaengen }); if (!p.success) return setFehler(ersteMeldung(p.error)); setFrage(true); }} disabled={!bereit}>
              <CheckIcon /> Prüfen und senden
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}
