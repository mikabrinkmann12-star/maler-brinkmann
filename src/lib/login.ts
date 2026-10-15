// Login per Benutzername: Supabase braucht intern eine E-Mail-Adresse.
// Aus "sebastian" wird "sebastian@<LOGIN_EMAIL_DOMAIN>". An diese Adressen
// wird nie etwas geschickt.

/** Muss zur Einstellung in Supabase (Authentication → Email) passen. */
export const MIN_PASSWORT_LAENGE = 10;

/** Muss zur CHECK-Regel von profiles.benutzername in der Migration passen. */
export const BENUTZERNAME_MUSTER = /^[a-z0-9][a-z0-9._-]{1,30}$/;

export function normalisiereBenutzername(eingabe: string): string {
  return eingabe.trim().toLowerCase();
}

export function istGueltigerBenutzername(eingabe: string): boolean {
  return BENUTZERNAME_MUSTER.test(normalisiereBenutzername(eingabe));
}

export function benutzernameZuLoginEmail(
  benutzername: string,
  loginDomain: string,
): string {
  const name = normalisiereBenutzername(benutzername);
  if (!BENUTZERNAME_MUSTER.test(name)) {
    throw new Error(`Ungültiger Benutzername: "${benutzername}"`);
  }
  const domain = loginDomain.trim().toLowerCase();
  if (!domain || domain.includes("@")) {
    throw new Error("LOGIN_EMAIL_DOMAIN ist nicht (richtig) gesetzt.");
  }
  return `${name}@${domain}`;
}

/** Vorschlag aus dem Vornamen, z. B. "Jürgen" → "juergen". */
export function benutzernameVorschlag(vorname: string): string {
  return vorname
    .trim()
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+/, "")
    .slice(0, 31);
}
