import type { Metadata } from "next";
import { requireBueroRecht } from "@/lib/auth";
import { kundennummerVorschlag } from "@/lib/kundennummer-daten";
import { LEERES_FORMULAR } from "@/lib/kontakt-formular";
import { KontaktFormular } from "../kontakt-formular";

export const metadata: Metadata = { title: "Neuer Kontakt" };

export default async function NeuerKontaktSeite() {
  await requireBueroRecht("kontakte_bearbeiten");
  const vorschlag = await kundennummerVorschlag();
  return <KontaktFormular id={null} start={LEERES_FORMULAR} vorschlag={vorschlag} zurueck="/buero/kontakte" />;
}
