// Lädt .env.local für die Datenbank-Tests (sie laufen gegen brinkmann-dev).
process.loadEnvFile(".env.local");

if (process.env.APP_ENV !== "development") {
  throw new Error(
    "Die RLS-Tests laufen nur gegen brinkmann-dev (APP_ENV=development in .env.local).",
  );
}
