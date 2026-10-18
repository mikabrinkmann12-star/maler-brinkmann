import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { firmaLaden } from "@/lib/firma-daten";
import { createClient } from "@/lib/supabase/server";
import { FirmaFormular } from "./formular";
import { LogoBereich } from "./logo-bereich";

export const metadata: Metadata = { title: "Firmendaten" };

export default async function FirmaSeite() {
  await requireRole(["admin"]);
  const firma = await firmaLaden();
  let logoUrl: string | null = null;
  if (firma.logo) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("firmenlogo").createSignedUrl(firma.logo, 3600);
    logoUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Firmendaten</h1>
        <p className="text-muted-foreground">
          Diese Angaben erscheinen auf Angeboten: Absenderzeile, Firmenblock oben rechts und die Fußzeile mit Steuer- und Bankdaten.
        </p>
      </div>
      <LogoBereich logoUrl={logoUrl} />
      <FirmaFormular firma={firma} />
    </div>
  );
}
