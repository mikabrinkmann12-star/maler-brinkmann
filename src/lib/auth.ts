import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rechtOk, rechteAusZeilen, type Rechte } from "@/lib/rechte";
import { BUERO_ROLLEN, startseiteFuer, type Rolle } from "@/lib/rollen";

export type AktuellerNutzer = {
  id: string;
  benutzername: string;
  vorname: string;
  nachname: string;
  rolle: Rolle;
  mussPasswortAendern: boolean;
};

type Sitzung =
  | { status: "abgemeldet" }
  | { status: "gesperrt" }
  | { status: "ok"; nutzer: AktuellerNutzer };

/**
 * Liest die Sitzung einmal pro Anfrage (cache).
 * - Wer eingeloggt ist, kommt aus dem geprüften JWT (getClaims).
 * - Rolle, aktiv und muss_passwort_aendern kommen IMMER frisch aus profiles,
 *   nie aus dem JWT. Ist das Profil nicht lesbar, ist der Nutzer deaktiviert
 *   (RLS zeigt deaktivierten Nutzern nicht einmal ihr eigenes Profil).
 */
export const ladeSitzung = cache(async (): Promise<Sitzung> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { status: "abgemeldet" };

  const { data: profil } = await supabase
    .from("profiles")
    .select("id, benutzername, vorname, nachname, rolle, muss_passwort_aendern")
    .eq("id", userId)
    .maybeSingle();
  if (!profil) return { status: "gesperrt" };

  return {
    status: "ok",
    nutzer: {
      id: profil.id,
      benutzername: profil.benutzername,
      vorname: profil.vorname,
      nachname: profil.nachname,
      rolle: profil.rolle,
      mussPasswortAendern: profil.muss_passwort_aendern,
    },
  };
});

/**
 * Für jede geschützte Seite und jede Server Action.
 * Leitet um, wenn niemand eingeloggt ist, der Zugang gesperrt ist oder
 * das Passwort erst geändert werden muss.
 */
export async function requireUser(optionen?: {
  passwortwechselErlaubt?: boolean;
}): Promise<AktuellerNutzer> {
  const sitzung = await ladeSitzung();
  if (sitzung.status === "abgemeldet") redirect("/login");
  if (sitzung.status === "gesperrt") redirect("/login?grund=gesperrt");
  if (sitzung.nutzer.mussPasswortAendern && !optionen?.passwortwechselErlaubt) {
    redirect("/passwort-aendern");
  }
  return sitzung.nutzer;
}

/** Wie requireUser, zusätzlich muss die Rolle passen. Sonst → eigene Startseite. */
export async function requireRole(
  rollen: readonly Rolle[],
): Promise<AktuellerNutzer> {
  const nutzer = await requireUser();
  if (!rollen.includes(nutzer.rolle)) redirect(startseiteFuer(nutzer.rolle));
  return nutzer;
}

/**
 * Rechte des eingeloggten Nutzers (einmal pro Anfrage). Admin: alles. Sonst die Zeilen seiner Rolle aus `role_permissions`
 * (lesen dürfen alle aktiven Nutzer, ändern nur der Admin). Fehlt etwas oder geht die Abfrage schief, gilt „nein“.
 */
export const ladeRechte = cache(async (): Promise<Rechte> => {
  const sitzung = await ladeSitzung();
  if (sitzung.status !== "ok") return rechteAusZeilen("mitarbeiter", []);
  const rolle = sitzung.nutzer.rolle;
  if (rolle === "admin") return rechteAusZeilen("admin", []);
  const supabase = await createClient();
  const { data, error } = await supabase.from("role_permissions").select("recht, stufe").eq("rolle", rolle);
  // Sicher: ohne Antwort gilt „nein“. Der Fehler kommt ins Protokoll, damit ein leeres Menü nicht rätselhaft bleibt.
  if (error) console.error("[rechte] Rechte konnten nicht geladen werden:", error.message);
  return rechteAusZeilen(rolle, data ?? []);
});

/** Hat der Nutzer das Recht? (Für Anzeige und Menüs; durchgesetzt wird es zusätzlich von der Datenbank.) */
export async function darf(recht: string): Promise<boolean> {
  return rechtOk(await ladeRechte(), recht);
}

/**
 * Wie requireUser, zusätzlich muss der Nutzer das Recht haben (Admin immer). Sonst → eigene Startseite.
 * Das ist die Prüfung für Seiten und Server-Aktionen; sie ersetzt requireRole(BUERO_ROLLEN) und requireRole(["admin"]), wo
 * der Admin das Recht in „Rollen & Zugriffsrechte“ einstellen kann. Die Rolle bleibt Pflicht für die Büro-Ansicht (/buero).
 */
export async function requireRecht(recht: string): Promise<AktuellerNutzer> {
  const nutzer = await requireUser();
  if (nutzer.rolle === "admin") return nutzer;
  if (!rechtOk(await ladeRechte(), recht)) redirect(startseiteFuer(nutzer.rolle));
  return nutzer;
}

/**
 * Für Seiten und Aktionen der Büro-Ansicht: Rolle Büro oder Admin UND das Recht (Admin immer). Ohne das Recht geht es zurück
 * auf die Büro-Übersicht. Ersetzt requireRole(BUERO_ROLLEN) und requireRole(["admin"]) bei allem, was der Admin einstellen kann.
 */
export async function requireBueroRecht(recht: string): Promise<AktuellerNutzer> {
  const nutzer = await requireRole(BUERO_ROLLEN);
  if (nutzer.rolle === "admin") return nutzer;
  if (!rechtOk(await ladeRechte(), recht)) redirect("/buero");
  return nutzer;
}
