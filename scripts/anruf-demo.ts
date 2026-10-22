// Demo-Anrufe in brinkmann-dev anlegen (für die Vorführung der Seite „Anrufe“), wie sie der Telefon-KI-Dienst schicken würde.
// Läuft nur mit APP_ENV=development, über den Webhook der laufenden App (npm run dev) mit dem Geheimnis aus .env.local.
// Aufruf: npx tsx scripts/anruf-demo.ts [Adresse, Standard http://localhost:3000]  | Aufräumen: npx tsx scripts/anruf-demo.ts --weg
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env.local");

function env(name: string): string {
  const w = process.env[name];
  if (!w) throw new Error(`${name} fehlt in .env.local`);
  return w;
}

const DEMOS = [
  { id: "demo-anruf-1", von: "+49 4492 123456", dauer_sek: 142, zusammenfassung: "Frau Meyer möchte ein Angebot für den Außenanstrich ihres Einfamilienhauses in Ramsloh. Sie bittet um einen Besichtigungstermin, am liebsten nächste Woche vormittags." },
  { id: "demo-anruf-2", von: "+49 4492 654321", dauer_sek: 58, zusammenfassung: "Herr Gerdes fragt, ob die Gerüstlieferung wie vereinbart am Donnerstag kommt. Bittet um Rückruf von Ralf." },
  { id: "demo-anruf-3", von: "+49 30 99887766", dauer_sek: 21, zusammenfassung: "Telefonmarketing für ein kostenloses Energieberatungs-Angebot. Anrufer wurde abgewiesen.", kategorie: "spam" },
  { id: "demo-anruf-4", von: "+49 441 555000", dauer_sek: 75, zusammenfassung: "Hausverwaltung fragt nach einem Termin für das Streichen des Treppenhauses in der Eschstraße. Rechnung vom letzten Auftrag sei eingegangen." },
];

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
  for (const d of DEMOS) {
    const r = await fetch(`${basis}/api/anrufe`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env("ANRUFE_WEBHOOK_SECRET")}` }, body: JSON.stringify(d) });
    console.log(d.id, r.status, await r.text());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
