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
  {
    id: "demo-anruf-1", von: "+49 4492 123456", dauer_sek: 142,
    zusammenfassung: "Frau Meyer möchte ein Angebot für den Außenanstrich ihres Einfamilienhauses in Ramsloh. Sie bittet um einen Besichtigungstermin, am liebsten nächste Woche vormittags.",
    transkript: [
      "KI: Maler Betrieb Brinkmann, guten Tag. Ich bin der digitale Assistent. Das Gespräch wird zur Bearbeitung aufgezeichnet. Wie kann ich helfen?",
      "Anrufer: Guten Tag, hier ist Meyer. Wir wollen unser Haus von außen streichen lassen und hätten gern ein Angebot.",
      "KI: Sehr gerne. Wo steht das Haus, und wie groß ist es ungefähr?",
      "Anrufer: In Ramsloh, ein Einfamilienhaus, so 140 Quadratmeter Wohnfläche. Die Fassade ist verputzt.",
      "KI: Danke. Dafür wäre eine Besichtigung am besten. Wann passt es Ihnen?",
      "Anrufer: Nächste Woche vormittags wäre gut, am liebsten Dienstag oder Mittwoch.",
      "KI: Ich notiere Dienstag oder Mittwoch vormittags. Unter welcher Nummer erreicht Herr Brinkmann Sie?",
      "Anrufer: Unter dieser hier, 04492 123456.",
      "KI: Vielen Dank, Frau Meyer. Ich gebe es weiter, das Büro meldet sich bei Ihnen. Einen schönen Tag noch.",
      "Anrufer: Danke, Wiederhören.",
    ].join("\n"),
  },
  {
    id: "demo-anruf-2", von: "+49 4492 654321", dauer_sek: 58,
    zusammenfassung: "Herr Gerdes fragt, ob die Gerüstlieferung wie vereinbart am Donnerstag kommt. Bittet um Rückruf von Ralf.",
    transkript: [
      "KI: Maler Betrieb Brinkmann, guten Tag. Ich bin der digitale Assistent. Wie kann ich helfen?",
      "Anrufer: Hier ist Gerdes. Ich wollte fragen, ob das Gerüst am Donnerstag wie besprochen kommt.",
      "KI: Das kann ich leider nicht sicher sagen. Soll Ralf Sie zurückrufen?",
      "Anrufer: Ja, bitte. Heute noch, wenn es geht. Sonst muss ich die Zufahrt nicht freihalten.",
      "KI: Ich notiere: Rückruf von Ralf heute wegen der Gerüstlieferung am Donnerstag. Unter dieser Nummer?",
      "Anrufer: Genau, diese Nummer.",
      "KI: Danke, Herr Gerdes. Ich gebe es sofort weiter.",
    ].join("\n"),
  },
  {
    id: "demo-anruf-3", von: "+49 30 99887766", dauer_sek: 21, kategorie: "spam",
    zusammenfassung: "Telefonmarketing für ein kostenloses Energieberatungs-Angebot. Anrufer wurde abgewiesen.",
    transkript: [
      "KI: Maler Betrieb Brinkmann, guten Tag. Wie kann ich helfen?",
      "Anrufer: Guten Tag, wir bieten Ihnen heute eine kostenlose Energieberatung für Ihr Unternehmen an.",
      "KI: Wir haben kein Interesse an Werbeanrufen. Bitte nehmen Sie unsere Nummer aus Ihrer Liste. Auf Wiederhören.",
    ].join("\n"),
  },
  {
    id: "demo-anruf-4", von: "+49 441 555000", dauer_sek: 75,
    zusammenfassung: "Hausverwaltung fragt nach einem Termin für das Streichen des Treppenhauses in der Eschstraße. Rechnung vom letzten Auftrag sei eingegangen.",
    transkript: [
      "KI: Maler Betrieb Brinkmann, guten Tag. Ich bin der digitale Assistent. Wie kann ich helfen?",
      "Anrufer: Hier ist die Hausverwaltung Janssen. Wir möchten das Treppenhaus in der Eschstraße streichen lassen. Wann hätten Sie Zeit?",
      "KI: Ab wann soll es losgehen, und wie viele Etagen sind es?",
      "Anrufer: Möglichst im November. Vier Etagen, das Treppenhaus ist ungefähr 30 Meter hoch gerechnet.",
      "KI: Ich gebe das an das Büro weiter, die melden sich mit einem Terminvorschlag. Sonst noch etwas?",
      "Anrufer: Ja, die Rechnung vom letzten Auftrag ist bei uns eingegangen, danke. Das wollte ich nur mitteilen.",
      "KI: Vielen Dank, ich notiere beides. Einen schönen Tag.",
    ].join("\n"),
  },
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
