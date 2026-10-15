# Übergabe an einen neuen Chat (Stand 15.10.2026, Commit ebcf943)

**Text zum Einfügen in den neuen Chat:**

> Du arbeitest weiter an meiner Handwerker-Software für den Malerbetrieb meines Vaters (Ralf Brinkmann, Saterland). Lies zuerst **CLAUDE.md** (vollständige Regeln, Datenmodell, Rechte, Entscheidungen, Befehle) und **docs/UEBERGABE.md** (diese Datei) sowie **docs/SETUP.md**. Arbeite auf **Experten-Niveau** (gründlich, sicherheitsbewusst, getestet), erkläre mir als Anfänger aber kurz auf Deutsch, was du tust und warum. **Bei jeder Rückfrage zu Geschäftslogik oder Entscheidungen: frag mich über das Auswahl-Menü (AskUserQuestion mit Optionen, Empfehlung zuerst), nicht als Freitext, und rate nie.** Arbeite in kleinen Teilschritten, nach jedem Schritt: Tests, Commit, Zusammenfassung „was fertig / was testen / wie testen“. Nächster Schritt: **Phase 1.4**.

## Projekt in Kürze
- Eigene Software statt Plancraft. **Status: Prototyp** – Mika stellt sie Ralf vor, erst danach wird gekauft. Bis dahin **nur Gratis-Dienste**, keine echten Daten.
- Stack: Next.js 16 (App Router, `src/`, Turbopack, Cache Components AUS), React 19, Tailwind 4, shadcn/ui (Base UI), Supabase (Postgres/Auth/Storage, Frankfurt), Vercel (Hobby, fra1), Vitest, tsx-Skripte.
- Repo: github.com/mikabrinkmann12-star/maler-brinkmann (privat). Online: https://maler-brinkmann-23nr.vercel.app (Push auf `main` = automatisches Deployment, ~2–3 Min).
- Supabase: `brinkmann-dev` (Ref akbqdpwajeaynwqczfkg, Demo-Daten, Ordner ist damit verknüpft) und `brinkmann-live` (Ref tezveryzixrysviapmal, keine Testdaten). Vercel: Production → live, Preview → dev.
- Live-Admin: `mika.brinkmann` (iPhone-Login getestet). Dev-Admin: `mikabrinkmann`. Demo-Zugänge (dev): `demo-admin`, `demo-buero`, `demo-sebastian`, `-christian`, `-jan`, `-tobias`, `-marco`, `-dennis`, `-lukas`, `-kevin` – Passwort `SEED_PASSWORT` in `.env.local`.

## Erledigt
- **Phase 0 komplett**: Login per Benutzername (intern `name@login.maler-brinkmann.de`), Pflicht-Passwortwechsel, Rollen admin/buero/mitarbeiter (nur aus `profiles.rolle`), Nutzerverwaltung, Sperren (aktiv=false + Bann + Sessions beenden), PWA (Manifest, MB-Icons, Service Worker, „Neue Version – Neu laden“, Install-Anleitung Android/iPhone), Seed, RLS überall, Audit-Log, Deployment.
- **Phase 1.1** Datenbank für Mitarbeiter-App (app_settings, assignments(+members), time_entries, leave_requests, notes, photos + privater Bucket `projektfotos`, material_usage, measurements(+deductions), notifications) inkl. Sperrfrist, Kollegen-hinzufügen-Policy, Urlaub nur Admin.
- **Phase 1.2** Einteilungs-Seite `/buero/plantafel` (Menü „Einteilung“) mit Spracheingabe (Browser-Spracherkennung) + Namen-Erkennung ohne KI, „Wie gestern“, Doppelt-Hinweis.
- **Phase 1.3** `/heute`, `/baustellen`, `/baustellen/[id]` mit Team + Kollegen hinzufügen (im Browser getestet: Sebastian fügt Dennis hinzu → Büro-Hinweis kommt an → Büro entfernt Dennis), Hinweise-Kasten auf `/buero`.
- Tests: 46 Unit-Tests (`npm test`), 69 DB-/Rechte-Tests (`npm run test:rls`, max. ~2× pro 5 Min wegen Login-Limit).

## Nächste Schritte (Phase 1)
- **1.4** Zeit eintragen (Standard 6:30–15:45, 45 Min Pause = 8,5 Std, nur Pausendauer; Baustelle vorausgewählt aus heutigem Einsatz; mehrere Baustellen/Tag; Kollegen derselben Baustelle mit ankreuzen; erlaubte Arten aus `app_settings.zeiterfassung`), „Meine Zeiten“ (bearbeiten innerhalb Sperrfrist: Monatsende + Kulanz bis 3.), Admin-Einstellungsseite „Zeiterfassung“, Formular-Entwürfe lokal speichern/erneut senden.
- **1.5** Fotos (Kamera, vor Upload verkleinern, Vorher/Nachher/Mangel, Kommentar) + Notizen.
- **1.6** Material (freier Text) + Aufmaß (Berechnung in `src/lib/aufmass.ts` mit Tests, VOB: Öffnungen ≤ 2,5 m² übermessen).
- **1.7** Urlaubsantrag + Genehmigung nur Admin. **1.8** Test auf iPhone/Android, Doku.
- Danach Phase 2 (Plantafel Drag & Drop), 3 (Büro + Import, vorher nach Plancraft-Exportformat fragen), 4 (Angebote), 5 (Lexware), 6 (später, inkl. Idee „Jarvis“-Sprachassistent).

## Entscheidungen (Kurzliste, Details in CLAUDE.md)
Benutzername-Login · Umschalter Büro↔Mitarbeiter · App-Name „Maler Brinkmann“ · 2 Supabase-Projekte, kein Docker · Commits mit GitHub-noreply-Adresse · Fahrzeuge/Status pflegt nur Admin · Sperrfrist Monatsende + 3 Tage Kulanz · Zeit-Arten für Mitarbeiter in Einstellungen konfigurierbar · Mitarbeiter dürfen für Kollegen derselben Baustelle Zeit eintragen · Urlaub genehmigt nur Admin · VOB-Übermessung automatisch · Einteilung schon in Phase 1 mit Spracheingabe + Namen-Erkennung (keine bezahlte/externe KI) · iPhone-Nutzer (Mika).

## Wichtige Stolperfallen
- Windows-PowerShell: `npm.cmd`/`npx.cmd` verwenden (Execution Policy). Git: `C:\Program Files\Git\cmd\git.exe`.
- Migrationen nie nachträglich ändern; neue Migration → erst dev (`npx supabase db push`), Code mit neuen Tabellen erst pushen, wenn Migration **auch in live** ist (link live → push → **sofort zurück auf dev** linken).
- Kontrollierte Formulare mit `abschicken()` statt `<form action>`; Links im Button-Stil mit `buttonVariants`.
- `insert().select()` braucht auch Leserecht (sonst RLS-Fehler).
- Neue Tabellen mit Verweis auf Demo-Daten im Seed-Aufräumen ergänzen; Test-Aufräumen muss notifications mitlöschen.
- Login-Fehler: nur `invalid_credentials` = „falsch“, sonst technischer Hinweis + Log.
- Vercel-Variablen nie im Dashboard bearbeiten, wenn „affect multiple environments“ steht.
- Hilfsskripte (Testnutzer, Vercel-API, Reste-Kontrolle) lagen nur im temporären Scratchpad – bei Bedarf neu schreiben.
