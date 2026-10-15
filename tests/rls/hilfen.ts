import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { benutzernameZuLoginEmail } from "@/lib/login";
import { nutzerAnlegen, type Rolle } from "@/lib/nutzer";

function env(name: string): string {
  const wert = process.env[name];
  if (!wert) throw new Error(`${name} fehlt in .env.local`);
  return wert;
}

const optionen = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

/** Client mit Secret Key: umgeht RLS. Nur für Vorbereitung/Aufräumen in Tests. */
export function adminClient(): SupabaseClient {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SECRET_KEY"),
    optionen,
  );
}

/** Client wie im Browser (Publishable Key), noch nicht eingeloggt. */
export function anonClient(): SupabaseClient {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    optionen,
  );
}

export function loginDomain(): string {
  return env("LOGIN_EMAIL_DOMAIN");
}

export function loginEmail(benutzername: string): string {
  return benutzernameZuLoginEmail(benutzername, loginDomain());
}

/** Meldet sich mit Benutzername + Passwort an und gibt den Client zurück. */
export async function einloggen(
  benutzername: string,
  passwort: string,
): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: loginEmail(benutzername),
    password: passwort,
  });
  if (error) throw new Error(`Login für ${benutzername} fehlgeschlagen: ${error.message}`);
  return client;
}

export type TestNutzer = { id: string; benutzername: string; passwort: string };

/** Legt einen Wegwerf-Nutzer an. Mit `testNutzerLoeschen` wieder entfernen. */
export async function testNutzerAnlegen(rolle: Rolle): Promise<TestNutzer> {
  const benutzername = `test-${randomBytes(4).toString("hex")}`;
  const passwort = `Test-${randomBytes(12).toString("hex")}`;
  const id = await nutzerAnlegen(adminClient(), loginDomain(), {
    benutzername,
    vorname: "Test",
    nachname: rolle,
    rolle,
    passwort,
    mussPasswortAendern: false,
  });
  return { id, benutzername, passwort };
}

/**
 * Löscht einen Wegwerf-Nutzer. Vorher werden Hinweise und Mitgliedschaften
 * entfernt, die auf ihn zeigen – sonst blockieren sie das Löschen.
 */
export async function testNutzerLoeschen(nutzer?: TestNutzer): Promise<void> {
  if (!nutzer) return;
  const db = adminClient();
  await db.from("notifications").delete().eq("ausgeloest_von", nutzer.id);
  await db.from("project_members").delete().eq("user_id", nutzer.id);
  await db.from("project_members").delete().eq("added_by", nutzer.id);
  const { error } = await db.auth.admin.deleteUser(nutzer.id);
  if (error) console.warn(`Test-Nutzer ${nutzer.benutzername} nicht gelöscht: ${error.message}`);
}
