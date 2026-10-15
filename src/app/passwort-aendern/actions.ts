"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { MIN_PASSWORT_LAENGE } from "@/lib/login";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PasswortZustand = { fehler?: string };

export async function passwortAendern(
  _vorher: PasswortZustand,
  formData: FormData,
): Promise<PasswortZustand> {
  const nutzer = await requireUser({ passwortwechselErlaubt: true });

  const passwort = String(formData.get("passwort") ?? "");
  const wiederholung = String(formData.get("wiederholung") ?? "");

  if (passwort.length < MIN_PASSWORT_LAENGE) {
    return {
      fehler: `Das Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen haben.`,
    };
  }
  if (passwort !== wiederholung) {
    return { fehler: "Die beiden Passwörter stimmen nicht überein." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: passwort });
  if (error) {
    if (error.code === "same_password") {
      return { fehler: "Das neue Passwort muss sich vom bisherigen unterscheiden." };
    }
    if (error.code === "weak_password") {
      return { fehler: "Dieses Passwort ist zu schwach. Bitte ein längeres wählen." };
    }
    return { fehler: "Das Passwort konnte nicht geändert werden. Bitte nochmal versuchen." };
  }

  // Erst NACH erfolgreichem Wechsel das Pflicht-Flag entfernen. Der Nutzer darf
  // profiles selbst nicht ändern, deshalb macht das der Server (nur für sich selbst).
  if (nutzer.mussPasswortAendern) {
    const { error: flagFehler } = await createAdminClient()
      .from("profiles")
      .update({ muss_passwort_aendern: false })
      .eq("id", nutzer.id);
    if (flagFehler) {
      return {
        fehler:
          "Das Passwort wurde geändert, aber es gab einen Fehler beim Speichern. Bitte nochmal versuchen.",
      };
    }
  }

  redirect("/");
}
