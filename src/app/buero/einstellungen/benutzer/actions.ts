"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { loginEmailDomain } from "@/lib/env";
import { NutzerFehler, nutzerAnlegen } from "@/lib/nutzer";
import { ersteMeldung, neuerNutzerSchema, stammdatenSchema } from "@/lib/nutzer-schema";
import { startpasswortErzeugen } from "@/lib/passwort";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Alle Aktionen: zuerst requireRole(["admin"]).
// Änderungen an profiles laufen über den Client des eingeloggten Admins
// (RLS + Admin-Schutz-Trigger greifen, das Protokoll zeigt, wer es war).
// Der Admin-Client (Secret Key) wird nur für Supabase Auth gebraucht.

const LISTE = "/buero/einstellungen/benutzer";
const SPERRE_DAUER = "876000h"; // ~100 Jahre = dauerhaft

type DbFehler = { code?: string; message: string };

/** Meldungen des Admin-Schutz-Triggers (P0001) sind schon auf Deutsch. */
function dbMeldung(fehler: DbFehler): string {
  return fehler.code === "P0001"
    ? fehler.message
    : "Speichern hat nicht geklappt. Bitte nochmal versuchen.";
}

function aktualisieren(id?: string) {
  revalidatePath(LISTE);
  if (id) revalidatePath(`${LISTE}/${id}`);
}

// ---------------------------------------------------------------------------
// Anlegen
// ---------------------------------------------------------------------------
export type AnlegenZustand = {
  fehler?: string;
  angelegt?: { name: string; benutzername: string; passwort: string };
};

export async function nutzerAnlegenAktion(
  _vorher: AnlegenZustand,
  formData: FormData,
): Promise<AnlegenZustand> {
  await requireRole(["admin"]);

  const pruefung = neuerNutzerSchema.safeParse(Object.fromEntries(formData));
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const d = pruefung.data;

  try {
    await nutzerAnlegen(
      createAdminClient(),
      loginEmailDomain(),
      { ...d, mussPasswortAendern: true },
      await createClient(),
    );
  } catch (fehler) {
    if (fehler instanceof NutzerFehler) return { fehler: fehler.message };
    throw fehler;
  }

  aktualisieren();
  // Das Startpasswort wird nur dieses eine Mal angezeigt und nirgends gespeichert.
  return {
    angelegt: {
      name: `${d.vorname} ${d.nachname}`.trim(),
      benutzername: d.benutzername,
      passwort: d.passwort,
    },
  };
}

// ---------------------------------------------------------------------------
// Stammdaten + Rolle ändern
// ---------------------------------------------------------------------------
export type SpeichernZustand = { fehler?: string; gespeichert?: number };

export async function nutzerSpeichern(
  id: string,
  _vorher: SpeichernZustand,
  formData: FormData,
): Promise<SpeichernZustand> {
  await requireRole(["admin"]);

  const pruefung = stammdatenSchema.safeParse(Object.fromEntries(formData));
  if (!pruefung.success) return { fehler: ersteMeldung(pruefung.error) };
  const d = pruefung.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      vorname: d.vorname,
      nachname: d.nachname,
      rolle: d.rolle,
      telefon: d.telefon || null,
      email: d.email || null,
    })
    .eq("id", id)
    .select("id");

  if (error) return { fehler: dbMeldung(error) };
  if (!data?.length) return { fehler: "Benutzer nicht gefunden." };

  aktualisieren(id);
  return { gespeichert: Date.now() };
}

// ---------------------------------------------------------------------------
// Passwort zurücksetzen → neues Startpasswort, Pflichtwechsel, Sessions beenden
// ---------------------------------------------------------------------------
export type PasswortZustand = { fehler?: string; neuesPasswort?: string };

export async function passwortZuruecksetzen(id: string): Promise<PasswortZustand> {
  const admin = await requireRole(["admin"]);
  if (id === admin.id) {
    return { fehler: "Dein eigenes Passwort änderst du unter „Passwort ändern“." };
  }

  const neuesPasswort = startpasswortErzeugen();
  const adminClient = createAdminClient();

  const { error: authFehler } = await adminClient.auth.admin.updateUserById(id, {
    password: neuesPasswort,
  });
  if (authFehler) {
    return { fehler: "Das Passwort konnte nicht zurückgesetzt werden." };
  }

  const supabase = await createClient();
  const { error: flagFehler } = await supabase
    .from("profiles")
    .update({ muss_passwort_aendern: true })
    .eq("id", id);
  if (flagFehler) return { fehler: dbMeldung(flagFehler) };

  // Alte Anmeldungen (z. B. auf einem verlorenen Handy) beenden.
  await adminClient.rpc("nutzer_sessions_beenden", { p_user_id: id });

  aktualisieren(id);
  return { neuesPasswort };
}

// ---------------------------------------------------------------------------
// Sperren / Entsperren
// ---------------------------------------------------------------------------
export type SperreZustand = { fehler?: string };

/** Sperren = aktiv:false + Supabase-Bann + alle Sessions beenden. */
export async function zugangSperren(id: string): Promise<SperreZustand> {
  const admin = await requireRole(["admin"]);
  if (id === admin.id) return { fehler: "Du kannst dich nicht selbst sperren." };

  // 1. Profil: hier greift auch der Schutz „mindestens ein aktiver Admin“.
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ aktiv: false }).eq("id", id);
  if (error) return { fehler: dbMeldung(error) };

  // 2. + 3. Login sperren und laufende Anmeldungen beenden.
  const adminClient = createAdminClient();
  const { error: bannFehler } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: SPERRE_DAUER,
  });
  const { error: sessionFehler } = await adminClient.rpc("nutzer_sessions_beenden", {
    p_user_id: id,
  });

  aktualisieren(id);
  if (bannFehler || sessionFehler) {
    return {
      fehler:
        "Der Zugang ist gesperrt, aber nicht alle Schritte haben geklappt. Bitte „Zugang sperren“ nochmal drücken.",
    };
  }
  return {};
}

/** Entsperren = Bann aufheben, dann aktiv:true. */
export async function zugangEntsperren(id: string): Promise<SperreZustand> {
  await requireRole(["admin"]);

  const { error: bannFehler } = await createAdminClient().auth.admin.updateUserById(id, {
    ban_duration: "none",
  });
  if (bannFehler) return { fehler: "Der Zugang konnte nicht entsperrt werden." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ aktiv: true }).eq("id", id);
  if (error) return { fehler: dbMeldung(error) };

  aktualisieren(id);
  return {};
}
