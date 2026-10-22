// Demo-Anrufe in brinkmann-dev anlegen (für die Vorführung der Seite „Anrufe“), wie sie der Telefon-KI-Dienst schicken würde.
// Läuft nur mit APP_ENV=development, über den Webhook der laufenden App (npm run dev) mit dem Geheimnis aus .env.local.
// Die Gespräche stehen in scripts/anruf-demo-daten.json; die Sprachdateien dazu (public/demo-anrufe/*.mp3) erzeugt scripts/anruf-demo-audio.py.
// Aufruf: npx tsx scripts/anruf-demo.ts [Adresse, Standard http://localhost:3000]  | Aufräumen: npx tsx scripts/anruf-demo.ts --weg
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

function env(name: string): string {
  const w = process.env[name];
  if (!w) throw new Error(`${name} fehlt in .env.local`);
  return w;
}

type Demo = { id: string; von: string; dauer_sek: number; kategorie?: string; zusammenfassung: string; gespraech: [string, string][] };

async function main() {
  if (process.env.APP_ENV !== "development") throw new Error("Nur in der Entwicklungs-Datenbank erlaubt (APP_ENV=development).");
  if (process.argv.includes("--weg")) {
    const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), { auth: { persistSession: false } });
    const { error } = await db.from("calls").delete().like("anbieter_id", "demo-anruf-%");
    if (error) throw new Error(error.message);
    await db.from("notifications").delete().eq("typ", "anruf");
    console.log("Demo-Anrufe entfernt.");
    return;
  }
  const basis = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3000";
  const demos = JSON.parse(readFileSync("scripts/anruf-demo-daten.json", "utf8")) as Demo[];
  for (const d of demos) {
    const inhalt = {
      id: d.id,
      von: d.von,
      dauer_sek: d.dauer_sek,
      kategorie: d.kategorie,
      zusammenfassung: d.zusammenfassung,
      transkript: d.gespraech.map(([wer, text]) => `${wer}: ${text}`).join("\n"),
      aufnahme_url: `/demo-anrufe/${d.id}.mp3`,
    };
    const r = await fetch(`${basis}/api/anrufe`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env("ANRUFE_WEBHOOK_SECRET")}` }, body: JSON.stringify(inhalt) });
    console.log(d.id, r.status, await r.text());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
