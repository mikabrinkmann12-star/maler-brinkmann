import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MIN_PASSWORT_LAENGE,
  benutzernameZuLoginEmail,
  normalisiereBenutzername,
} from "@/lib/login";
import type { Rolle } from "@/lib/rollen";

export type { Rolle };

export type NeuerNutzer = {
  benutzername: string;
  vorname: string;
  nachname?: string;
  rolle: Rolle;
  telefon?: string;
  /** Optionale echte Kontakt-E-Mail (nicht die Login-Adresse). */
  email?: string;
  passwort: string;
  /** Standard: true. Nur beim ersten Admin (eigenes Passwort) false. */
  mussPasswortAendern?: boolean;
};

export class NutzerFehler extends Error {}

/**
 * Legt einen Nutzer an: erst den Login (Supabase Auth), dann die Profildaten.
 * Der Datenbank-Trigger erzeugt das Profil mit sicheren Standardwerten
 * (Rolle mitarbeiter). Hier werden Name, Rolle usw. direkt in profiles gesetzt.
 * Schlägt das fehl, wird der Login wieder entfernt.
 *
 * `admin` muss ein Client mit Secret Key sein. Nur serverseitig aufrufen!
 * `profilClient`: In der App der Client des eingeloggten Admins, damit im
 * Änderungsprotokoll steht, WER den Nutzer angelegt hat. In Skripten/Tests
 * reicht der Admin-Client.
 */
export async function nutzerAnlegen(
  admin: SupabaseClient,
  loginDomain: string,
  neu: NeuerNutzer,
  profilClient: SupabaseClient = admin,
): Promise<string> {
  if (neu.passwort.length < MIN_PASSWORT_LAENGE) {
    throw new NutzerFehler(
      `Das Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen haben.`,
    );
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: benutzernameZuLoginEmail(neu.benutzername, loginDomain),
    password: neu.passwort,
    email_confirm: true,
  });

  if (error || !data.user) {
    if (error?.code === "email_exists") {
      throw new NutzerFehler("Dieser Benutzername ist schon vergeben.");
    }
    throw new NutzerFehler(
      `Nutzer konnte nicht angelegt werden: ${error?.message ?? "unbekannt"}`,
    );
  }

  const id = data.user.id;
  const { error: profilFehler } = await profilClient
    .from("profiles")
    .update({
      benutzername: normalisiereBenutzername(neu.benutzername),
      vorname: neu.vorname.trim(),
      nachname: neu.nachname?.trim() ?? "",
      rolle: neu.rolle,
      telefon: neu.telefon?.trim() || null,
      email: neu.email?.trim() || null,
      muss_passwort_aendern: neu.mussPasswortAendern ?? true,
    })
    .eq("id", id);

  if (profilFehler) {
    await admin.auth.admin.deleteUser(id);
    throw new NutzerFehler(
      `Profil konnte nicht gespeichert werden: ${profilFehler.message}`,
    );
  }

  return id;
}
