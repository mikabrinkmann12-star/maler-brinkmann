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

export type SmtpKonfiguration = { host: string; port: number; user: string; password: string; von: string };

/**
 * Zugang zum Postfach für den E-Mail-Versand (nur serverseitig). Fehlt etwas, ist der Versand „nicht eingerichtet“
 * und die Oberfläche sagt das, statt abzustürzen. Variablen: SMTP_HOST, SMTP_PORT (587 oder 465), SMTP_USER, SMTP_PASSWORD,
 * optional SMTP_FROM (Absender, Standard = SMTP_USER).
 */
export function smtpKonfiguration(): SmtpKonfiguration | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT ?? "587");
  if (!host || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, user, password, von: process.env.SMTP_FROM?.trim() || user };
}

export type ImapKonfiguration = { host: string; port: number; user: string; password: string; ordner: string };

/**
 * Zugang zum Postfach, aus dem Eingangsrechnungen abgeholt werden (nur serverseitig). Fehlt etwas, ist der Abruf „nicht eingerichtet“.
 * Variablen: IMAP_HOST, IMAP_PORT (Standard 993), IMAP_USER, IMAP_PASSWORD, optional IMAP_ORDNER (Standard INBOX).
 * Am besten ein eigenes Postfach oder ein eigener Ordner nur für Rechnungen: Gelesen werden nur ungelesene Mails, danach gelten sie als gelesen.
 */
export function imapKonfiguration(): ImapKonfiguration | null {
  const host = process.env.IMAP_HOST?.trim();
  const user = process.env.IMAP_USER?.trim();
  const password = process.env.IMAP_PASSWORD;
  const port = Number(process.env.IMAP_PORT ?? "993");
  if (!host || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, user, password, ordner: process.env.IMAP_ORDNER?.trim() || "INBOX" };
}
