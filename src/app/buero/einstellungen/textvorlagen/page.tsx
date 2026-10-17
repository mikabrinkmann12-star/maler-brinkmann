import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { textvorlagenLaden } from "@/lib/textvorlagen-daten";
import { VorlagenVerwaltung } from "./vorlagen-verwaltung";

export const metadata: Metadata = { title: "Textvorlagen" };

export default async function TextvorlagenSeite() {
  await requireRole(["admin"]);
  const vorlagen = await textvorlagenLaden();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/buero/einstellungen" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Einstellungen
        </Link>
        <h1 className="text-2xl font-semibold">Textvorlagen</h1>
        <p className="text-muted-foreground">
          Mehrere Anfangs- und Schlusstexte für Angebote, zum Beispiel für Privatkunden und Gewerbe. Im Angebot wählt das Büro eine Vorlage aus, ihr Text wird eingesetzt und bleibt dort änderbar.
          Die Standard-Vorlage füllt neue Angebote vor. Ohne Standard gilt der Text aus „Angebote – Vorgaben“.
        </p>
      </div>
      <VorlagenVerwaltung vorlagen={vorlagen} />
    </div>
  );
}
