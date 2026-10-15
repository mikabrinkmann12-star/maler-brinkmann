"use server";

import { redirect } from "next/navigation";
import { loginEmailDomain } from "@/lib/env";
import { benutzernameZuLoginEmail, istGueltigerBenutzername } from "@/lib/login";
import { createClient } from "@/lib/supabase/server";

export type LoginZustand = { fehler?: string; benutzername: string };

const TECHNISCHER_FEHLER =
  "Anmelden ist gerade nicht möglich (technischer Fehler). Bitte später nochmal versuchen oder im Büro melden.";

export async function anmelden(
  _vorher: LoginZustand,
  formData: FormData,
): Promise<LoginZustand> {
  const benutzername = String(formData.get("benutzername") ?? "").trim();
  const passwort = String(formData.get("passwort") ?? "");

  // Bewusst dieselbe Meldung für "gibt es nicht" und "falsches Passwort".
  const falsch = { fehler: "Benutzername oder Passwort ist falsch.", benutzername };
  if (!istGueltigerBenutzername(benutzername) || !passwort) return falsch;

  let fehler: { code?: string; status?: number; message: string } | null;
  try {
    const supabase = await createClient();
    ({ error: fehler } = await supabase.auth.signInWithPassword({
      email: benutzernameZuLoginEmail(benutzername, loginEmailDomain()),
      password: passwort,
    }));
  } catch (ausnahme) {
    // z. B. fehlende Umgebungsvariable → im Vercel-Protokoll sichtbar
    console.error("[login] Ausnahme beim Anmelden:", ausnahme);
    return { fehler: TECHNISCHER_FEHLER, benutzername };
  }

  if (fehler) {
    // NUR echte Zugangsdaten-Fehler als „falsch“ melden. Alles andere (z. B.
    // falscher API-Key bei Vercel) ist ein technisches Problem und wird protokolliert.
    if (fehler.code === "invalid_credentials") return falsch;
    if (fehler.code === "user_banned") {
      return { fehler: "Dein Zugang ist gesperrt. Bitte melde dich im Büro.", benutzername };
    }
    if (fehler.status === 429 || fehler.code === "over_request_rate_limit") {
      return { fehler: "Zu viele Versuche. Bitte warte ein paar Minuten.", benutzername };
    }
    console.error("[login] Supabase-Fehler beim Anmelden:", {
      code: fehler.code,
      status: fehler.status,
      message: fehler.message,
    });
    return { fehler: TECHNISCHER_FEHLER, benutzername };
  }

  // "/" leitet je nach Rolle bzw. Pflicht-Passwortwechsel weiter.
  redirect("/");
}
