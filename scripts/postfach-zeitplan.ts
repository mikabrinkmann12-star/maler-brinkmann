// Richtet den 15-Minuten-Abruf des Rechnungs-Postfachs ein (Supabase pg_cron ruft /api/cron/eingangsrechnungen auf).
// Erzeugt ein neues zufälliges Geheimnis, legt es in den Supabase-Vault (über `postfach_zeitplan_setzen`, nur Dienst-Schlüssel)
// und als CRON_SECRET in Vercel (Production). Das Geheimnis wird nirgends ausgegeben. Danach Production neu bauen lassen.
//
// Aufruf: npx tsx scripts/postfach-zeitplan.ts <env-datei> <app-adresse>
//   z. B. npx tsx scripts/postfach-zeitplan.ts .env.live https://maler-brinkmann-23nr.vercel.app
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function envLesen(datei: string): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const zeile of readFileSync(datei, "utf-8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(zeile.trim());
    if (m) werte[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return werte;
}

async function main() {
  const [datei, adresse] = process.argv.slice(2);
  if (!datei || !adresse) throw new Error("Aufruf: npx tsx scripts/postfach-zeitplan.ts <env-datei> <app-adresse>");
  const env = envLesen(datei);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const schluessel = env.SUPABASE_SECRET_KEY;
  if (!url || !schluessel) throw new Error(`In ${datei} fehlen NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SECRET_KEY.`);

  const geheimnis = randomBytes(32).toString("hex");
  const db = createClient(url, schluessel, { auth: { persistSession: false } });
  const { error } = await db.rpc("postfach_zeitplan_setzen", { p_url: `${adresse.replace(/\/$/, "")}/api/cron/eingangsrechnungen`, p_geheimnis: geheimnis });
  if (error) throw new Error(`Zeitplan in Supabase: ${error.message}`);
  console.log(`Zeitplan in Supabase gesetzt (${new URL(url).hostname}).`);

  // Vercel: CRON_SECRET überschreiben (--force). Das Geheimnis geht nur über stdin an die Befehlszeile.
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npx, ["vercel@latest", "env", "add", "CRON_SECRET", "--environment", "production", "--force"], {
    input: geheimnis,
    stdio: ["pipe", "ignore", "inherit"],
    shell: process.platform === "win32",
  });
  console.log("CRON_SECRET in Vercel (Production) erneuert. Jetzt Production neu bauen lassen.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
