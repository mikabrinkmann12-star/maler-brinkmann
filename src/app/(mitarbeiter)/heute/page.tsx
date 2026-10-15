import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";
import { requireUser } from "@/lib/auth";
import { formatDatumLang } from "@/lib/format";

export const metadata: Metadata = { title: "Heute" };

export default async function HeuteSeite() {
  const nutzer = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-muted-foreground">{formatDatumLang(new Date())}</p>
        <p className="text-2xl font-semibold">Moin, {nutzer.vorname}!</p>
      </div>
      <Platzhalter titel="Heute" phase="Phase 1">
        Hier siehst du dein Auto, deine Baustelle mit Adresse und
        Google-Maps-Link, wer dabei ist, den Ansprechpartner und die Notizen vom
        Büro.
      </Platzhalter>
    </div>
  );
}
