import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Einstellungen" };

/** Wie in Plancraft öffnet „Einstellungen“ gleich die erste Seite (Mitarbeiter); das Menü links führt zu allen anderen. */
export default async function EinstellungenSeite() {
  // Doppelt hält besser: auch die Seite selbst prüft die Rolle.
  await requireRole(["admin"]);
  redirect("/buero/einstellungen/benutzer");
}
