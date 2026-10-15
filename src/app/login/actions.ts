"use server";

import { redirect } from "next/navigation";
import { loginEmailDomain } from "@/lib/env";
import { benutzernameZuLoginEmail, istGueltigerBenutzername } from "@/lib/login";
import { createClient } from "@/lib/supabase/server";

export type LoginZustand = { fehler?: string; benutzername: string };

export async function anmelden(
  _vorher: LoginZustand,
  formData: FormData,
): Promise<LoginZustand> {
  const benutzername = String(formData.get("benutzername") ?? "").trim();
  const passwort = String(formData.get("passwort") ?? "");

  // Bewusst dieselbe Meldung für "gibt es nicht" und "falsches Passwort".
  const falsch = { fehler: "Benutzername oder Passwort ist falsch.", benutzername };
  if (!istGueltigerBenutzername(benutzername) || !passwort) return falsch;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: benutzernameZuLoginEmail(benutzername, loginEmailDomain()),
    password: passwort,
  });

  if (error) {
    if (error.code === "user_banned") {
      return {
        fehler: "Dein Zugang ist gesperrt. Bitte melde dich im Büro.",
        benutzername,
      };
    }
    if (error.status === 429) {
      return {
        fehler: "Zu viele Versuche. Bitte warte ein paar Minuten.",
        benutzername,
      };
    }
    return falsch;
  }

  // "/" leitet je nach Rolle bzw. Pflicht-Passwortwechsel weiter.
  redirect("/");
}
