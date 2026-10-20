import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ladeRechte, requireRole } from "@/lib/auth";
import { rechtOk } from "@/lib/rechte";
import { BUERO_ROLLEN } from "@/lib/rollen";

export const metadata: Metadata = { title: "Einstellungen" };

/** Wie in Plancraft öffnet „Einstellungen“ gleich die erste Seite (Mitarbeiter); das Menü links führt zu allen anderen. Das Büro landet bei seiner ersten erlaubten Seite. */
export default async function EinstellungenSeite() {
  // Doppelt hält besser: auch die Seite selbst prüft.
  const nutzer = await requireRole(BUERO_ROLLEN);
  if (nutzer.rolle === "admin") redirect("/buero/einstellungen/benutzer");
  const rechte = await ladeRechte();
  if (rechtOk(rechte, "einstellungen_firma")) redirect("/buero/einstellungen/firma");
  if (rechtOk(rechte, "kalkulation_aendern")) redirect("/buero/einstellungen/kalkulation");
  redirect("/buero");
}
