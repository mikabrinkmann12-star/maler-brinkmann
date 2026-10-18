import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { kundennummerVorschlag } from "@/lib/kundennummer-daten";
import { BUERO_ROLLEN } from "@/lib/rollen";
import { LEERES_FORMULAR } from "@/lib/kontakt-formular";
import { KontaktFormular } from "../kontakt-formular";

export const metadata: Metadata = { title: "Neuer Kontakt" };

export default async function NeuerKontaktSeite() {
  await requireRole(BUERO_ROLLEN);
  const vorschlag = await kundennummerVorschlag();
  return <KontaktFormular id={null} start={LEERES_FORMULAR} vorschlag={vorschlag} zurueck="/buero/kontakte" />;
}
