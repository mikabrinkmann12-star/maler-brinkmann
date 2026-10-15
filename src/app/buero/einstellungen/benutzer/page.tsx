import type { Metadata } from "next";
import { Platzhalter } from "@/components/platzhalter";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Benutzer & Rollen" };

export default async function BenutzerSeite() {
  await requireRole(["admin"]);

  return (
    <Platzhalter titel="Benutzer & Rollen" phase="Schritt 0.4">
      Mitarbeiter mit Benutzername und Startpasswort anlegen, Rollen ändern,
      Zugänge sperren und Passwörter zurücksetzen.
    </Platzhalter>
  );
}
