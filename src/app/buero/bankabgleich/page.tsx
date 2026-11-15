import type { Metadata } from "next";
import { darf, requireBueroRecht, requireRole } from "@/lib/auth";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { Abgleich } from "./abgleich";

export const metadata: Metadata = { title: "Kontoauszug abgleichen" };

export default async function BankabgleichSeite() {
  await requireRole(BUERO_ROLLEN);
  const [ausgang, eingang] = await Promise.all([darf("rechnungen"), darf("eingangsrechnungen")]);
  // Ohne eines der beiden Rechte zurück ins Büro
  if (!ausgang && !eingang) await requireBueroRecht("rechnungen");

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Kontoauszug abgleichen</h1>
        <p className="text-sm text-muted-foreground">
          Lade den Umsatz-Export deines Geschäftskontos hoch. Die App sucht dazu passende offene {eingang && ausgang ? "Eingangs- und Ausgangsrechnungen" : eingang ? "Eingangsrechnungen" : "Ausgangsrechnungen"}{" "}
          (Rechnungsnummer im Verwendungszweck, IBAN, Name, Betrag, auch mit Skonto). Du hakst an, was stimmt, und bucht sie mit dem Buchungstag als bezahlt.
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">So bekommst du die Datei (Volksbank)</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Im Online-Banking das Geschäftskonto öffnen → „Umsätze“.</li>
            <li>Zeitraum wählen (z. B. die letzten 30 Tage).</li>
            <li>„Exportieren“ bzw. das Download-Symbol → Format „CSV“ (oder „CAMT“; eine ZIP-Datei vorher entpacken).</li>
            <li>Die Datei hier oben auswählen.</li>
          </ol>
        </details>
      </div>
      <Abgleich />
    </div>
  );
}
