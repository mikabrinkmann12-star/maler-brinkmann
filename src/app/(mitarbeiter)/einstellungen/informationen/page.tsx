import type { Metadata } from "next";
import { SeitenKopf } from "@/components/layout/seiten-kopf";
import { requireUser } from "@/lib/auth";
import { firmaLaden } from "@/lib/firma-daten";
import { EIGENE_VERSION } from "@/lib/pwa";

export const metadata: Metadata = { title: "Informationen" };

export default async function InformationenSeite() {
  await requireUser();
  const firma = await firmaLaden();
  const zeilen = [
    [firma.name, firma.inhaber && `Inhaber: ${firma.inhaber}`],
    [firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" ")],
    [firma.telefon && `Telefon: ${firma.telefon}`, firma.email && `E-Mail: ${firma.email}`],
    [firma.ustid && `USt-ID: ${firma.ustid}`],
  ]
    .map((z) => z.filter(Boolean).join(" · "))
    .filter((z) => z.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <SeitenKopf titel="Informationen" zurueck="/einstellungen" />
      <section className="flex flex-col gap-1 rounded-xl border bg-card p-4">
        <h2 className="mb-1 font-semibold">Anbieter</h2>
        {zeilen.length === 0 && <p className="text-muted-foreground">Noch keine Firmendaten eingetragen.</p>}
        {zeilen.map((z, i) => (
          <p key={i} className="text-sm">{z}</p>
        ))}
      </section>
      <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <h2 className="mb-1 font-semibold text-foreground">Datenschutz</h2>
        <p>Datenschutzerklärung und Vertrag zur Auftragsverarbeitung (AVV) werden ergänzt, bevor die App mit echten Daten im Betrieb läuft.</p>
      </section>
      <p className="text-center text-xs text-muted-foreground">Version {EIGENE_VERSION.slice(0, 7)}</p>
    </div>
  );
}
