import type { Metadata } from "next";
import { requireBueroRecht } from "@/lib/auth";
import { projektnummerStart, projektnummerVorschlag } from "@/lib/projektnummer-daten";
import { KUNDENNUMMER_BEISPIEL } from "@/lib/kundennummer";
import { createClient } from "@/lib/supabase/server";
import { GUTSCHRIFT_PRAEFIX_STANDARD, RECHNUNG_PRAEFIX_STANDARD, rechnungsnummerBeispiel } from "@/lib/rechnung-eigen";
import { NummernkreisFormular } from "./formular";

export const metadata: Metadata = { title: "Nummernkreise" };

export default async function NummernkreiseSeite() {
  await requireBueroRecht("einstellungen_firma");
  const [start, vorschlag] = await Promise.all([projektnummerStart(), projektnummerVorschlag()]);
  const supabase = await createClient();
  const jahr = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date()));
  const [{ data: einst }, { data: zaehlerListe }] = await Promise.all([
    supabase.from("app_settings").select("wert").eq("schluessel", "nummernkreise").maybeSingle(),
    supabase.from("invoice_counters").select("gruppe, letzte").eq("jahr", jahr),
  ]);
  const zaehler = zaehlerListe?.find((z) => z.gruppe === "rechnung");
  const gutschriftZaehler = zaehlerListe?.find((z) => z.gruppe === "gutschrift");
  const wert = (einst?.wert ?? {}) as { rechnung_praefix?: unknown; rechnung_start?: unknown; gutschrift_praefix?: unknown; gutschrift_start?: unknown };
  const praefix = typeof wert.rechnung_praefix === "string" && wert.rechnung_praefix ? wert.rechnung_praefix : RECHNUNG_PRAEFIX_STANDARD;
  const rechnungStart = typeof wert.rechnung_start === "number" && wert.rechnung_start >= 1 ? wert.rechnung_start : 1;
  const gutschriftPraefix = typeof wert.gutschrift_praefix === "string" && wert.gutschrift_praefix ? wert.gutschrift_praefix : GUTSCHRIFT_PRAEFIX_STANDARD;
  const gutschriftStart = typeof wert.gutschrift_start === "number" && wert.gutschrift_start >= 1 ? wert.gutschrift_start : 1;
  const naechste = rechnungsnummerBeispiel(praefix, jahr, zaehler ? zaehler.letzte + 1 : rechnungStart);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Nummernkreise</h1>
        <p className="text-muted-foreground">
          Projektnummern haben das Format <strong>P-(2400)NNN</strong> (wie in Plancraft, der Kopf ist fest) und zählen ohne Neustart weiter.
          Kundennummern (z. B. {KUNDENNUMMER_BEISPIEL}) zählen automatisch ab der höchsten vorhandenen Nummer.
          Rechnungsnummern vergibt die App selbst (lückenlos, je Jahr neu): z. B. <strong>R-2026-0001</strong>. Die nächste ist <strong>{naechste}</strong>.
        </p>
      </div>
      <NummernkreisFormular
        start={start}
        vorschlag={vorschlag}
        rechnungPraefix={praefix}
        rechnungStart={rechnungStart}
        bereitsVergeben={Boolean(zaehler)}
        gutschriftPraefix={gutschriftPraefix}
        gutschriftStart={gutschriftStart}
        gutschriftBereitsVergeben={Boolean(gutschriftZaehler)}
        jahr={jahr}
      />
    </div>
  );
}
