// Legt einen Admin-Zugang an (für Mika und Ralf, später auch in Live).
//
//   npm run admin:anlegen                 → nutzt .env.local (brinkmann-dev)
//   npm run admin:anlegen -- .env.live    → nutzt eine andere Env-Datei
//
// Das Passwort wählst du selbst (wird beim Tippen nicht angezeigt),
// deshalb gibt es hier keinen Pflicht-Passwortwechsel.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  MIN_PASSWORT_LAENGE,
  benutzernameVorschlag,
  istGueltigerBenutzername,
  normalisiereBenutzername,
} from "../src/lib/login";
import { NutzerFehler, nutzerAnlegen } from "../src/lib/nutzer";

const envDatei = process.argv[2] ?? ".env.local";
process.loadEnvFile(envDatei);

function env(name: string): string {
  const wert = process.env[name];
  if (!wert) throw new Error(`${name} fehlt in ${envDatei}`);
  return wert;
}

/** Fragt verdeckt ab: Jedes Zeichen wird als * angezeigt. */
function fragePasswort(frage: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(frage);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let eingabe = "";

    const beiTaste = (zeichen: string) => {
      for (const z of zeichen) {
        if (z === "\r" || z === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", beiTaste);
          stdout.write("\n");
          resolve(eingabe);
          return;
        }
        if (z === "\u0003") {
          // Strg+C
          stdout.write("\nAbgebrochen.\n");
          process.exit(1);
        }
        if (z === "\u007f" || z === "\b") {
          if (eingabe.length > 0) {
            eingabe = eingabe.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        eingabe += z;
        stdout.write("*");
      }
    };

    stdin.on("data", beiTaste);
  });
}

async function frage(text: string, standard?: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  const hinweis = standard ? ` [${standard}]` : "";
  const antwort = (await rl.question(`${text}${hinweis}: `)).trim();
  rl.close();
  return antwort || standard || "";
}

async function main() {
  if (!stdin.isTTY) {
    throw new NutzerFehler(
      "Bitte direkt im Terminal starten (npm.cmd run admin:anlegen), sonst geht die verdeckte Passworteingabe nicht.",
    );
  }
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  console.log(`\nAdmin anlegen in: ${url}  (aus ${envDatei})\n`);

  const vorname = await frage("Vorname");
  const nachname = await frage("Nachname");
  if (!vorname) throw new NutzerFehler("Vorname fehlt.");

  const benutzername = normalisiereBenutzername(
    await frage("Benutzername", benutzernameVorschlag(vorname)),
  );
  if (!istGueltigerBenutzername(benutzername)) {
    throw new NutzerFehler(
      "Ungültiger Benutzername (nur a–z, 0–9, Punkt, Bindestrich, Unterstrich).",
    );
  }

  const passwort = await fragePasswort(
    `Passwort (mind. ${MIN_PASSWORT_LAENGE} Zeichen): `,
  );
  const wiederholung = await fragePasswort("Passwort wiederholen: ");
  if (passwort !== wiederholung) {
    throw new NutzerFehler("Die Passwörter stimmen nicht überein.");
  }

  const ok = await frage(
    `\n${vorname} ${nachname} als ADMIN mit Benutzername "${benutzername}" anlegen? (j/n)`,
  );
  if (ok.toLowerCase() !== "j") {
    console.log("Abgebrochen, nichts angelegt.");
    return;
  }

  const admin = createClient(url, env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await nutzerAnlegen(admin, env("LOGIN_EMAIL_DOMAIN"), {
    benutzername,
    vorname,
    nachname,
    rolle: "admin",
    passwort,
    mussPasswortAendern: false,
  });

  console.log(`\n✔ Admin "${benutzername}" angelegt. Du kannst dich jetzt anmelden.`);
}

main().catch((fehler: unknown) => {
  const text = fehler instanceof Error ? fehler.message : String(fehler);
  console.error(`\n✘ ${text}`);
  process.exit(1);
});
