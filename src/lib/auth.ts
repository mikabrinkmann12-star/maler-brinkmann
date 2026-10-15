import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { startseiteFuer, type Rolle } from "@/lib/rollen";

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
