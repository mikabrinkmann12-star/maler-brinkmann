# Übergabe an einen neuen Chat (Stand 16.10.2026, nach Phase 2)

**Text zum Einfügen in den neuen Chat:**

> Du arbeitest weiter an meiner Handwerker-Software für den Malerbetrieb meines Vaters (Ralf Brinkmann, Saterland). Lies zuerst **CLAUDE.md** (vollständige Regeln, Datenmodell, Rechte, Entscheidungen, Befehle) und **docs/UEBERGABE.md** (diese Datei) sowie **docs/SETUP.md**. Arbeite auf **Experten-Niveau** (gründlich, sicherheitsbewusst, getestet), erkläre mir als Anfänger aber kurz auf Deutsch, was du tust und warum. **Bei jeder Rückfrage zu Geschäftslogik oder Entscheidungen: frag mich über das Auswahl-Menü (AskUserQuestion mit Optionen, Empfehlung zuerst), nicht als Freitext, und rate nie.** Arbeite in kleinen Teilschritten, nach jedem Schritt: Tests, Commit, Zusammenfassung „was fertig / was testen / wie testen“. Nächster Schritt: **Phase 1.8** (Test auf iPhone/Android, vor allem Drag & Drop in der Einteilung), danach **Phase 3** (Büro-Grundlagen, Import aus Plancraft, archivierte Projekte für alle lesbar).

## Projekt in Kürze
- Eigene Software statt Plancraft. **Status: Prototyp** – Mika stellt sie Ralf vor, erst danach wird gekauft. Bis dahin **nur Gratis-Dienste**, keine echten Daten.
- Stack: Next.js 16 (App Router, `src/`, Turbopack, Cache Components AUS), React 19, Tailwind 4, shadcn/ui (Base UI), Supabase (Postgres/Auth/Storage, Frankfurt), Vercel (Hobby, fra1), Vitest, tsx-Skripte.
- Repo: github.com/mikabrinkmann12-star/maler-brinkmann (privat). Online: https://maler-brinkmann-23nr.vercel.app (Push auf `main` = automatisches Deployment, ~1 Min).
- Supabase: `brinkmann-dev` (Ref akbqdpwajeaynwqczfkg, Demo-Daten, Ordner ist damit verknüpft) und `brinkmann-live` (Ref tezveryzixrysviapmal, keine Testdaten). Vercel: Production → live, Preview → dev.
- Live-Admin: `mika.brinkmann`. Dev-Admin: `mikabrinkmann`. Demo-Zugänge (dev): `demo-admin`, `demo-buero`, `demo-sebastian`, `-christian`, `-jan`, `-tobias`, `-marco`, `-dennis`, `-lukas`, `-kevin` – Passwort `SEED_PASSWORT` in `.env.local`.

## Erledigt
- **Phase 0 komplett** (Login per Benutzername, Rollen, Nutzerverwaltung, PWA, Seed, RLS, Audit, Deployment).
- **Phase 1.1–1.3**: Datenbank der Mitarbeiter-App, Einteilung mit Spracheingabe, „Heute“, „Meine Baustellen“, Kollegen hinzufügen.
- **Phase 1.4** Zeiterfassung: `/zeiten` (Monatsliste, Summen), `/zeiten/neu` (Einsatz-Baustelle + 6:30–15:45/45 Min vorausgefüllt, Kollegen ankreuzen, Überschneidungsschutz), `/zeiten/[id]` (ändern/löschen), Admin-Einstellungen „Zeiterfassung“. **Warteschlange**: Eingaben bleiben bei Funkloch auf dem Handy und werden nachgesendet (Server-Aktionen idempotent).
- **Phase 1.5** Fotos (Kamera/Galerie, im Browser verkleinert, privater Speicher, IndexedDB bei Funkloch) + Notizen auf der Baustellen-Seite.
- **Phase 1.6** Material melden (Büro hakt ab, Kasten auf `/buero`) + Aufmaß (`/baustellen/[id]/aufmass`, VOB: Öffnungen ≤ 2,5 m² übermessen).
- **Phase 1.7** Urlaub: `/urlaub` (beantragen, zurückziehen), `/buero/urlaub` (nur Admin entscheidet).
- Tests: 103 Unit-Tests (`npm test`), 77 DB-/Rechte-Tests (`npm run test:rls`). Alles im Browser durchgespielt (mit Wegwerf-Zugängen, danach gelöscht).
- **Nachtrag 16.10. (Migration `20261016140000`, in dev UND live eingespielt):** Freitag 6:30–12:45 mit 15 Min Pause · Zeiten derselben Person dürfen sich nie überlappen (DB-Regel) · Urlaubsanspruch pro Mitarbeiter in der Nutzerverwaltung (Christian 30, Sebastian/Carmen/Manuel 28 noch einzutragen, sobald es sie gibt) · genehmigter Urlaub bucht automatisch Zeiten (Mo–Do 8:30, Fr 6:00) · Resturlaub-Anzeige.

- **Phase 2 (16.10., Migration `20261016160000` in dev UND live):** Plantafel mit Tag/Woche/Monat/Termine, Drag & Drop, mehrere Baustellen pro Auto (festes Team, Zeit um/ab optional), Termine für alle (Mitarbeiter: `/termine`, Büro: `/buero/plantafel/termine`), „Heute“ zeigt alle Stopps und Termine. Details in CLAUDE.md → Phase 2.

## Testen (für Mika)
- **Auf dem Handy mit Demo-Daten:** Zweig `vorschau` auf GitHub → Vercel baut eine Preview-Version, die mit **dev** arbeitet. Adresse: vercel.com → Projekt → Deployments → oberste „Preview“-Zeile (oder `npx.cmd vercel@latest ls`). Für neue Stände: `git push origin main:vorschau`.
- Anmelden z. B. als `demo-sebastian` (Maler), `demo-buero`, `demo-admin`.
- Einsätze gibt es für den 16.10.2026 (Caddy hat zwei Baustellen, die zweite ab 13:00). An einem anderen Tag als `demo-buero` unter **Einteilung → „Wie gestern“** übernehmen (holt den letzten Tag mit Einsätzen, max. 7 Tage zurück).

## Nächste Schritte
- **1.8** Test auf iPhone/Android (Kamera-Upload, Zeit eintragen, Funkloch = Flugmodus), Feiertage Niedersachsen (Urlaub, Werktage) einplanen.
- Danach Phase 3 (Büro + Import, vorher nach Plancraft-Exportformat fragen), 4 (Angebote), 5 (Lexware), 6 (später, inkl. Idee „Jarvis“).

## Entscheidungen (Kurzliste, Details in CLAUDE.md)
Benutzername-Login · Umschalter Büro↔Mitarbeiter · App-Name „Maler Brinkmann“ · 2 Supabase-Projekte, kein Docker · Commits mit GitHub-noreply-Adresse · Fahrzeuge/Status pflegt nur Admin · Sperrfrist Monatsende + 3 Tage Kulanz · Zeit-Arten für Mitarbeiter in Einstellungen konfigurierbar · Mitarbeiter dürfen für Kollegen derselben Baustelle Zeit eintragen · Urlaub genehmigt nur der Admin · VOB-Übermessung automatisch · Einteilung mit Spracheingabe + Namen-Erkennung (keine bezahlte/externe KI) · iPhone-Nutzer (Mika). Neu (Annahmen, noch zu bestätigen): Aufmaß-Abzüge gelten für die ganze Zeile; Stunden werden als „8:30 Std“ angezeigt; Material-Einheiten als feste Liste.

## Wichtige Stolperfallen
- Windows-PowerShell: `npm.cmd`/`npx.cmd` verwenden (Execution Policy). Git: `C:\Program Files\Git\cmd\git.exe`.
- Migrationen nie nachträglich ändern; neue Migration → erst dev (`npx supabase db push`), Code mit neuen Tabellen erst pushen, wenn Migration **auch in live** ist (link live → push → **sofort zurück auf dev** linken).
- Kontrollierte Formulare nie mit `<form action>`; Links im Button-Stil mit `buttonVariants`.
- Neue Server-Aktionen, die aus Formularen der Mitarbeiter-App kommen: idempotent bauen (ID kommt aus `neueId()`) und in `src/app/(mitarbeiter)/senden.ts` eintragen.
- `insert().select()` braucht auch Leserecht (sonst RLS-Fehler).
- Neue Tabellen mit Verweis auf Demo-Daten im Seed-Aufräumen ergänzen; Test-Aufräumen muss notifications mitlöschen und `app_settings.updated_by` zurücksetzen.
- Login-Fehler: nur `invalid_credentials` = „falsch“, sonst technischer Hinweis + Log.
- Vercel-Variablen nie im Dashboard bearbeiten, wenn „affect multiple environments“ steht.
- Hilfsskripte (Wegwerf-Testzugänge, Reste-Kontrolle) lagen nur im temporären Scratchpad – bei Bedarf neu schreiben. Für Browser-Tests eigene Wegwerf-Nutzer mit selbst erzeugtem Passwort anlegen (das Seed-Passwort ist für Claude gesperrt) und danach samt Daten und Foto-Dateien löschen.
