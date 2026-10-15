// Zentrale Stelle für Umgebungsvariablen mit verständlicher Fehlermeldung.
// NEXT_PUBLIC_-Werte müssen wörtlich ausgeschrieben werden, damit Next.js sie
// in den Browser-Code einsetzen kann.

function pruefe(name: string, wert: string | undefined): string {
  if (!wert) {
    throw new Error(
      `Umgebungsvariable ${name} fehlt. Lokal in .env.local eintragen, online in Vercel.`,
    );
  }
  return wert;
}

export function supabaseUrl(): string {
  return pruefe("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabasePublishableKey(): string {
  return pruefe(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** Nur serverseitig! (Aufruf im Browser liefert undefined → Fehler.) */
export function supabaseSecretKey(): string {
  return pruefe("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
}

export function loginEmailDomain(): string {
  return pruefe("LOGIN_EMAIL_DOMAIN", process.env.LOGIN_EMAIL_DOMAIN);
}
