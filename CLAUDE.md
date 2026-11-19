@AGENTS.md

# Maler Brinkmann – Handwerker-Software

## Status: Prototyp (Stand 15.10.2026)
Alles ist aktuell ein **Test/Prototyp**. Mika stellt die App am Ende Ralf vor, Ralf entscheidet. Erst danach wird etwas gekauft (Vercel Pro, Supabase Pro, ggf. KI).
- Bis dahin nur **kostenlose Varianten** (Vercel Hobby, Supabase Free, keine bezahlten APIs). Keine kostenpflichtigen Dienste vorschlagen, ohne ausdrücklich auf die Kosten hinzuweisen.
- **Keine echten Mitarbeiter- oder Kundendaten** in die App, solange keine Backups gebucht sind. Nur Test-/Demo-Daten.
  - **Bewusste Ausnahme (Mika, 16.10.2026):** Die echten Konten sind angelegt, in **dev und live**: `ralf.brinkmann` (Admin), `lena.eigenmeier` (Büro), `christian.lampe` (30 Urlaubstage), `sebastian.plentner`, `carmen.bronn`, `manuel.hinrichs` (je 28 Urlaubstage). Dazu die Entwickler-Admins `mikabrinkmann` (dev) und `mika.brinkmann` (live). Alle haben ein Startpasswort und müssen es beim ersten Login ändern. Die Demo-Konten (`demo-…`) und `test.user` wurden in dev gelöscht. Ohne Backups bleiben Zeiten/Fotos dieser Personen trotzdem ungesichert, bis Supabase Pro gebucht ist.
  - Startpasswörter stehen nur in `zugangsdaten-dev.txt` / `zugangsdaten-live.txt` im Projektordner (per `.gitignore` nie im Repo). Nach dem Weitergeben löschen.
  - `npm run seed` legt die `demo-…`-Konten in dev bei Bedarf wieder an und räumt nur sie weg.
- Supabase Free pausiert Projekte nach 7 Tagen ohne Nutzung. Dann im Dashboard wieder starten.

## Projektziel
Eigene Handwerker-Software für den **Maler Betrieb Ralf Brinkmann** (Saterland), ca. 6–15 Nutzer.
Soll **Plancraft komplett ablösen**. Die Mitarbeiter-App (Phase 1) läuft zunächst parallel zu Plancraft.

Entwickler ist **Mika** (Anfänger): kurz erklären, was gemacht wird und warum, in kleinen Schritten arbeiten.

## Arbeitsweise (verbindlich)
- In **Phasen** arbeiten. Nur die Phase bauen, die Mika freigibt.
- **Vor** jeder Phase: kurze Liste, was gebaut wird. **Nach** jeder Phase: Zusammenfassung (was fertig ist, was Mika testen soll, wie er es testet) und ein Commit mit klarer Nachricht.
- Bei unklarer **Geschäftslogik nachfragen, nicht raten**.
- **Diese Datei aktuell halten**: Stack, Datenmodell, Rollen, Entscheidungen, Befehle und Phasenstatus.

## Harte Regeln
- **Rechnungen (geändert 24.10.2026, Mika: „Paul zahlt nicht für Lexware“):** Die App vergibt Rechnungsnummer und PDF **standardmäßig selbst** (`invoices.anbieter = 'eigen'`, Datenbank-Funktion `rechnung_finalisieren`, lückenlos je Jahr, nach dem Fertigstellen gesperrt; Details `docs/EIGENE-RECHNUNGEN.md`). **Lexware und sevdesk sind seit 25.10.2026 aus der App entfernt** (kein Anschluss mehr; alte Rechnungen bleiben als „ältere Rechnung“ lesbar, bezahlbar und mahnbar). **Vor dem echten Einsatz muss der Steuerberater von Ralf das Verfahren bestätigen** (GoBD, ab 2028 E-Rechnung). Rechnungsnummern nie anders als über `rechnung_finalisieren` vergeben. Abschlags-/Schlussrechnung, Storno/Gutschrift, E-Rechnung (XML, noch nicht amtlich geprüft), Mail-Versand, Mahnwesen und Steuerberater-Export sind gebaut (Stand 24.10.2026).
- **Jede Tabelle hat Row Level Security (RLS).** Rechte werden serverseitig durchgesetzt (RLS + Server-Checks), nie nur im UI versteckt.
- **`profiles.rolle` ist die einzige Quelle für die Rolle.** `app_metadata`/`user_metadata` werden nirgends gelesen, auch nicht beim Anlegen. Nie JWT-Claims für Rechte nutzen. `requireRole()` liest Rolle, `aktiv` und `muss_passwort_aendern` bei jeder Anfrage frisch aus `profiles`.
- **Bereits eingespielte Migrationen nie ändern**, stattdessen eine neue Migration anlegen.
- **RLS-Hilfsfunktionen** (`ist_admin()`, `ist_buero_oder_admin()`, `ist_projektmitglied()` …) sind `SECURITY DEFINER`, `STABLE`, mit `set search_path = ''` und voll qualifizierten Namen. Sie zählen nur aktive Nutzer. Rechte: `REVOKE EXECUTE … FROM PUBLIC, anon` und `GRANT EXECUTE … TO authenticated`.
- **Admin-Funktionen** (z. B. `nutzer_sessions_beenden()`): `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` und `GRANT EXECUTE … TO service_role`. Trigger-Funktionen: `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`.
- **Jede Seite und jede Server Action mit Daten ruft selbst `requireUser()`, `requireRole()`, `requireRecht()` bzw. `requireBueroRecht()` auf** (`src/lib/auth.ts`). Alles, was der Admin unter „Rollen & Zugriffsrechte“ einstellen kann, prüft das **Recht** (`requireRecht("schluessel")` in der Mitarbeiter-App, `requireBueroRecht("schluessel")` in der Büro-Ansicht = Rolle Büro/Admin **und** Recht); `requireRole(["admin"])` bleibt nur für das, was fest beim Admin liegt (Nutzerverwaltung, Rollen/Rechte, API-Schlüssel, Postfach). Layouts prüfen zwar auch, werden aber bei Navigation innerhalb des Layouts nicht neu ausgeführt.
- Der **Admin-Client** (`src/lib/supabase/admin.ts`, Secret Key, umgeht RLS) nur nach `requireRole(["admin"])` verwenden. Ausnahmen: Das eigene `muss_passwort_aendern` nach erfolgreichem Passwortwechsel zurücksetzen, der **tägliche Postfach-Abruf** (`/api/cron/…`, nur mit `CRON_SECRET`), die **API** `/api/v1` (nur mit gültigem API-Schlüssel, siehe unten und `docs/API.md`) und die Webhooks **`/api/anrufe`** (`ANRUFE_WEBHOOK_SECRET`) und **`/api/anfragen`** (Website-Anfragen, `ANFRAGEN_WEBHOOK_SECRET`, schreibt nur in `website_anfragen`).
- **Keine Secrets im Frontend oder Repo**, nur in Umgebungsvariablen. `.env*` steht in `.gitignore` (Ausnahme `.env.example`, immer ohne Werte). Der Supabase **Secret Key** wird nur in Dateien mit `import "server-only"` benutzt. Der **Publishable Key** darf ins Frontend, weil RLS die Daten schützt.
- **Nichts endgültig löschen** bei Projekten, Kontakten, Zeiten und Angeboten: archivieren (`archiviert_am`), keine DELETE-Policies dafür.
- Wichtige Tabellen bekommen den **Audit-Trigger** (`audit_log`: wer hat was wann geändert).
- **Oberfläche komplett auf Deutsch.** Datum `TT.MM.JJJJ`, Beträge `1.234,56 €`. Dafür immer `src/lib/format.ts` nutzen. Zeitzone `Europe/Berlin`.
- **Firmendaten** (Briefkopf, USt-ID, Steuernummer, Bank …) kommen nur aus den Einstellungen, nie hardcoden.
- **Testdaten (Seed) nur in `brinkmann-dev`**, nie in Live. Das Seed-Skript bricht ab, wenn nicht `APP_ENV=development` gesetzt ist.
- Mobile-first für Mitarbeiter: große Buttons (mind. 48 px), wenig Text, keine verschachtelten Menüs (Plancraft war den Mitarbeitern zu kompliziert).
- Formulare dürfen Eingaben nicht verlieren, wenn das Senden fehlschlägt: lokal zwischenspeichern und erneut senden. Ein Offline-Modus wird nicht gebaut. Dafür die Warteschlange (`src/lib/warteschlange.ts`) nutzen und Server-Aktionen idempotent bauen (IDs neuer Datensätze erzeugt die App mit `neueId()`).
- **Formulare mit kontrollierten Feldern (useState) nie mit `<form action={…}>` abschicken**, sondern mit `onSubmit={(e) => abschicken(e, aktion)}` aus `src/lib/formular.ts`. Grund: React setzt das Formular sonst nach dem Speichern zurück, ein `<select>` zeigt dann den alten Wert, und beim nächsten Speichern wird dieser falsche Wert geschickt. Dieser Fehler ist in 0.4 im Browser aufgefallen.

## Tech-Stack
- **Next.js 16** (App Router, TypeScript, `src/`, Turbopack), React 19. Achtung: In Next 16 heißt `middleware.ts` jetzt `proxy.ts`. Vor neuem Next-Code die Doku in `node_modules/next/dist/docs/` lesen (siehe AGENTS.md).
- **Cache Components sind bewusst aus** (`next.config.ts`). Fast alle Seiten hängen vom eingeloggten Nutzer ab und werden pro Anfrage erzeugt, so bleibt der Code einfach.
- **Tailwind CSS 4** + **shadcn/ui** (Preset `base-nova`, also **Base UI** statt Radix: Komponenten nutzen die `render`-Prop statt `asChild`). Klassen werden mit `cn` aus dem Paket `cn` gemischt (offizielles shadcn-Paket).
- Für die Mitarbeiter-App gibt es die Button-Größen `size="touch"` (48 px) und `size="icon-touch"`.
- **Supabase**: Postgres, Auth und Storage, Region **Central EU (Frankfurt)**. Libraries `@supabase/supabase-js` + `@supabase/ssr`.
- Formulare: `react-hook-form` + `zod`. Toasts: `sonner`.
- Tests: **Vitest**
- **Hosting: Vercel**, Functions-Region `fra1`. Jeder Push auf `main` wird automatisch deployed.
- **PWA** (Schritt 0.5):
  - `src/app/manifest.ts` („Maler Brinkmann“, standalone, theme `#171717`). Icons liegen in `public/icons/` (192, 512, maskable 512), dazu `src/app/icon.png` (Tab) und `src/app/apple-icon.png` (iPhone). Alle werden per `npm run icons` aus dem **Firmenlogo** `scripts/logo-quelle.png` erzeugt (weißer Grund, Logo mittig; dazu `public/logo.png` für die Oberfläche, Komponente `AppLogo` in Login, Büro-Seitenleiste und Handy-Menü, seit 18.10.2026). Anderes Logo: Quelldatei austauschen und `npm run icons` ausführen. Das Logo im PDF ist davon getrennt (Einstellungen → Firmendaten).
  - `public/sw.js`: bewusst ohne Offline-Cache und ohne fetch-Handler. Er ist die Grundlage für spätere Push-Benachrichtigungen und wird nie gecacht (Header in `next.config.ts`).
  - **Update-Hinweis:** `NEXT_PUBLIC_APP_VERSION` = `VERCEL_DEPLOYMENT_ID` bzw. `VERCEL_GIT_COMMIT_SHA` (lokal fest „lokal“, also dort nie ein Hinweis). `PwaHelfer` (Root-Layout) fragt `/api/version` beim Start, beim Zurückholen der App, bei „online“ und alle 5 Minuten ab. Bei Abweichung erscheint unten „Neue Version – Neu laden“.
  - „App installieren“ unter Mehr (`AppInstallieren`): Knopf, wenn Chrome `beforeinstallprompt` anbietet. Auf iPhone/iPad erscheint die Safari-Anleitung (Teilen → Zum Home-Bildschirm), sonst die Chrome-Anleitung (⋮ → App installieren). Bei installierter App ein Häkchen. Update-Hinweis und Installation sind auf dem iPhone getestet (15.10.2026).
  - Sicherheits-Header für alle Seiten: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`.
- Links im Button-Stil immer mit `buttonVariants(…)` aus `@/components/ui/button` (läuft durch `cn`, sonst heben sich Klassen wie der Rahmen auf).

## Umgebungen
| | Supabase-Projekt | Vercel |
|---|---|---|
| Entwicklung | `brinkmann-dev` (Ref `akbqdpwajeaynwqczfkg`, Testdaten) | lokal + Preview-Deployments |
| Live | `brinkmann-live` (Ref `tezveryzixrysviapmal`, echte Daten, nie Seed) | Production (`main`) → **https://maler-brinkmann-23nr.vercel.app** |

- GitHub: `github.com/mikabrinkmann12-star/maler-brinkmann` (privat). Commits mit der anonymen Adresse `296533198+mikabrinkmann12-star@users.noreply.github.com`.
- Vercel-Team „maler“, Projekt `maler-brinkmann-23nr` (Ordner per `vercel link` verknüpft, `.vercel/` ist nicht im Repo). Mika ist in der Vercel-Befehlszeile angemeldet (`npx vercel@latest …`), damit lassen sich z. B. Variablen (`env ls`) und Deployments prüfen. Jeder Push auf `main` wird automatisch deployed (dauert ca. 2–3 Minuten).
- Vercel-Variablen nicht im Dashboard bearbeiten, wenn dort „affect multiple environments“ steht: Das ändert auch Production. Gezielt per API bzw. Befehlszeile ändern. `vercel.json`: `framework: nextjs` (sonst 404, siehe docs/SETUP.md), Region `fra1`.
- Migrationen müssen in **beide** Supabase-Projekte: erst dev, nach dem Test live (Ablauf in docs/SETUP.md, danach immer wieder mit dev verknüpfen).
- **Testen auf dem Handy mit Demo-Daten:** Zweig `vorschau` (angelegt 16.10.2026). `git push origin main:vorschau` → Vercel baut eine Preview-Version mit **dev**-Datenbank (Adresse unter vercel.com → Deployments bzw. `npx vercel@latest ls`). Production/live hat keine Testdaten.
- Ausführliche Einrichtung: `docs/SETUP.md`.

- Kein Docker und kein lokales Supabase. DB-Änderungen nur als Migration in `supabase/migrations/`, eingespielt mit `npx supabase db push`.
- Umgebungsvariablen: siehe `.env.example`.

## Rollen
| Rolle | Wer | Darf |
|---|---|---|
| `admin` | Ralf (Chef), Mika (Entwickler) | Alles, inkl. Einstellungen, Nutzerverwaltung, Rollen ändern |
| `buero` | Sekretärin | Projekte, Kontakte, Angebote, Rechnungen, Plantafel, Zeiten aller sehen/bearbeiten. **Keine** Nutzer-/Rollenverwaltung, **keine** Firmeneinstellungen |
| `mitarbeiter` | Maler auf der Baustelle | Nur Mitarbeiter-App: eigene Einsätze, Projekte, auf denen er eingetragen ist, eigene Zeiten, Fotos/Notizen/Material/Aufmaß, Kollegen zur eigenen Baustelle hinzufügen |


## Wissens-Notizen (bei Bedarf lesen, nicht alles auf einmal)
Die Details stehen in `docs/wissen/` (Obsidian-Vault). **Vor der Arbeit an einem Bereich die passende Notiz lesen**, sonst nicht:
- [Rechte pro Rolle](docs/wissen/rechte-rollen.md): `role_permissions`, Katalog `src/lib/rechte.ts`, `requireRecht()`, Tests
- [Login & Nutzer](docs/wissen/login-nutzer.md): Benutzername-Login, Nutzerverwaltung, Sperren
- [Datenmodell](docs/wissen/datenmodell.md): alle Tabellen, RLS-Tabellen Phase 0–1
- [Phase 0 – Grundgerüst](docs/wissen/phase-0.md)
- [Phase 1 – Mitarbeiter-App](docs/wissen/phase-1-mitarbeiter-app.md): Heute, Zeiten, Fotos, Urlaub, Stempeluhr, Berichte, Chat
- [Phase 2 – Plantafel](docs/wissen/phase-2-plantafel.md)
- [Phase 3 – Büro](docs/wissen/phase-3-buero.md): Kontakte, Projekte, Zeiten, Katalog, Kalkulation, Einstellungen, API für Jarvis, Container, Dashboard, Anrufe, **Website-Anfragen** (`/buero/anfragen`)
- [Phase 4 – Angebote](docs/wissen/phase-4-angebote.md): Editor, PDF, Mail, Freigabe-Link, Chat, Berichte, Dokumentarten
- [Phase 5 – Rechnungen](docs/wissen/phase-5-rechnungen.md): Lexware, sevdesk, E-Rechnung, Jarvis (eigene Plattform), KI-System
- [Phase 6 – Später](docs/wissen/phase-6-spaeter.md)
- API-Referenz: `docs/API.md`, Einrichtung: `docs/SETUP.md`
**Hinweis:** Neue Entscheidungen in die passende Notiz schreiben, nicht hierher. Die Gesamtsicherung der alten CLAUDE.md liegt unter `C:\Users\mikab\CLAUDE-APP-Sicherung-2026-10-22.md`.

## Phasenstand (Kurz)
Phase 0 ✅ · Phase 1 🔄 (1.8 Test auf Handy offen) · Phase 2 ✅ · Phase 3 🔄 · Phase 4 🔄 · Phase 5 🔄 (eigene Rechnungen, E-Rechnung noch nicht amtlich geprüft; Steuerberater muss das Verfahren bestätigen) · Phase 6 offen. Jarvis ist eine eigene Plattform (nur über `/api/v1`).

## Kernfeature: Kollegen zur Baustelle hinzufügen (Phase 1, höchste Priorität)
- Ein Mitarbeiter, der einem Projekt zugeordnet ist, kann andere Mitarbeiter hinzufügen. Danach können diese sofort Zeiten auf dem Projekt eintragen.
- Das geht nur für Projekte, auf denen der Hinzufügende selbst eingetragen ist (über RLS durchgesetzt).
- Protokoll: Wer hat wen wann hinzugefügt. Sichtbar für Admin/Büro im Projekt-Verlauf + als Benachrichtigung.
- Admin/Büro können die Zuordnung wieder entfernen.

## Einstellungen (Admin)
Firmendaten (✅ seit Phase 4), Angebots-Vorgaben (✅), Logo/Briefpapier, Nummernkreise (Angebote/Projekte, Rechnungen und Gutschriften), Zahlungsziel, Anfangs-/Schlusstexte, E-Mail-Vorlagen, Fahrzeuge, Mitarbeiter + Rollen, Arbeitszeitmodelle, Feiertage (Niedersachsen), Projektstatus.

## Qualität
- Tests für Rechte (ein Mitarbeiter darf **nicht** fremde Projekte/Zeiten sehen) und für Preis-/Summenberechnungen
- Tägliches Backup (Supabase Pro + zusätzlicher Export) mit Wiederherstellungs-Anleitung, **vor dem Go-Live**
- Archivieren statt löschen

## Befehle
- `npm run dev`: Entwicklungsserver auf http://localhost:3000
- `npm run build`: Produktions-Build (prüft auch TypeScript)
- `npm run lint`: ESLint
- `npm test`: Unit-Tests einmal ausführen (Vitest, Dateien `src/**/*.test.ts`)
- `npm run test:watch`: Tests im Beobachtungsmodus
- `npm run test:rls`: Datenbank-/Rechte-Tests gegen `brinkmann-dev` (`tests/rls/`, lädt `.env.local`, legt Wegwerf-Nutzer `test-…` an und löscht sie wieder). Supabase begrenzt Logins auf ca. 30 pro 5 Minuten und IP, also nicht im Dauerlauf starten.
- In `brinkmann-dev` gibt es Mikas echten Admin-Zugang `mikabrinkmann`. Tests und Browser-Prüfungen dürfen ihn **nie** ändern oder löschen, sie nutzen nur eigene Wegwerf-Nutzer.
- `npm run db:push`: neue Migrationen ins verknüpfte Supabase-Projekt einspielen (vorher mit `npx supabase db push --dry-run` prüfen)
- `npm run db:types`: TypeScript-Typen neu erzeugen → `src/lib/supabase/database.types.ts` (nach jeder Migration)
- `npm run admin:anlegen [-- <env-datei>]`: Admin-Zugang anlegen (interaktiv, verdeckte Passworteingabe, braucht ein echtes Terminal). Standard ist `.env.local`.
- `npm run icons`: App-Icons neu erzeugen (`scripts/icons-erzeugen.ts`, sharp)
- `npm run seed`: Testdaten in `brinkmann-dev` (`scripts/seed.ts`, Daten in `scripts/seed-daten.ts`). Läuft nur mit `APP_ENV=development`, kann beliebig oft laufen (räumt eigene alte Daten vorher weg) und lässt alles andere unberührt.
  - Kennzeichen der Seed-Daten: Benutzer `demo-…`, Kunden `D-1001…`, Projekte `D-2026-001…`, Fahrzeuge `CLP-DE …`
  - Zugänge: `demo-admin`, `demo-buero` sowie die Maler `demo-sebastian`, `demo-christian`, `demo-jan`, `demo-tobias`, `demo-marco`, `demo-dennis`, `demo-lukas` und `demo-kevin` (muss das Passwort ändern). Alle haben dasselbe Passwort `SEED_PASSWORT` aus `.env.local` (fehlt es, wird eins erzeugt und eingetragen).
  - Inhalt: 25 erfundene Kunden aus der Region, 12 Projekte in allen 9 Status (eins archiviert), 4 Fahrzeuge und 3 Einsätze für den Seed-Tag (Sprinter 1 → Gerdes, Sprinter 2 → Ringstraße, Caddy → Kramer **und ab 13:00 Uhr Treppenhaus Eschstraße** als zweiter Stopp). Termine relativ zum Seed-Tag, sodass immer 3 Projekte „In Arbeit“ sind.
  - Räumt vorher auch alle Phase-1-Daten weg, die an Demo-Nutzern, -Projekten oder -Fahrzeugen hängen (Einsätze, Zeiten, Urlaub, Notizen, Fotos inkl. Speicher, Material, Aufmaß, Hinweise). Neue Tabellen mit Verweis auf Demo-Daten **hier ergänzen**, sonst scheitert der Seed.
  - Telefonnummern aus dem Film-Nummernbereich `040 66969 …`, E-Mails `@example.com`, damit nie echte Personen erwischt werden.
- Wegwerf-Daten der DB-Tests: Benutzer `test-…`, Kunden/Projekte/Fahrzeuge/Status `TEST-…`. Die Tests räumen sie selbst wieder auf. Achtung: Spalten wie `app_settings.updated_by` verweisen auf Nutzer und blockieren sonst das Löschen (`testNutzerLoeschen` setzt sie vorher auf null).
- Skripte in `scripts/` laufen mit `tsx`, das die `@/`-Pfade versteht. Kein `await` auf oberster Ebene, stattdessen `main()`.
- Zeigt der Dev-Server nach Änderungen Fehler wie „… is not a function“, obwohl `npm run build` sauber ist: Dev-Server neu starten.
- Supabase-CLI: `npx supabase …`. Mika ist eingeloggt (`supabase login`), der Ordner ist mit `brinkmann-dev` verknüpft (Ref `akbqdpwajeaynwqczfkg`, eu-central-1).
- **In Mikas PowerShell-Terminal** sind Skripte gesperrt (Execution Policy) → dort `npx.cmd` bzw. `npm.cmd` statt `npx`/`npm` verwenden.

## Projektstruktur (Kurzüberblick)
- `src/app/`: Seiten (App Router)
  - `/login`, `/passwort-aendern`: ohne App-Layout. `/` leitet je nach Rolle weiter.
  - `(mitarbeiter)/`: `/heute`, `/baustellen` (+ `[id]`, `[id]/aufmass`, `…/neu`, `…/[mid]`), `/zeiten` (+ `neu`, `[id]`), `/urlaub`, `/mehr`. Bottom-Navigation, für alle Rollen. Admin/Büro sehen oben das Band „Zurück ins Büro“. Gemeinsam: `senden.ts` + `warteschlange.tsx` (Warteschlange).
  - `buero/`: `/buero` (Hinweise, Material-Meldungen), `/buero/plantafel`, `/projekte`, `/kontakte`, `/zeiten` (+ `neu`, `[id]`, `export`), `/urlaub`, `/katalog` (+ `neu`, `[art]/[id]`), `/angebote` (+ `neu`, `[id]`, `[id]/pdf`). Sidebar (am Handy ausklappbares Menü), nur Admin/Büro.
  - `buero/einstellungen/`: nur Admin (eigenes Layout mit `requireRole(["admin"])`), darunter `benutzer/` (Liste), `benutzer/neu`, `benutzer/[id]`, `zeiterfassung/`.
- `src/proxy.ts`: Session-Erneuerung + Login-Pflicht (in Next 16 statt `middleware.ts`)
- `src/lib/auth.ts`: `ladeSitzung()`, `requireUser()`, `requireRole()`, `ladeRechte()`, `darf()`, `requireRecht()`, `requireBueroRecht()` (server-only). `src/lib/rechte.ts`: Rechte-Katalog (auch im Browser nutzbar). `src/lib/auth-aktionen.ts`: `abmelden()`
- `src/lib/rollen.ts`: Typ `Rolle`, `ROLLEN_NAMEN`, `BUERO_ROLLEN`, `startseiteFuer()` (auch im Browser nutzbar)
- `src/lib/env.ts`: Umgebungsvariablen mit verständlicher Fehlermeldung
- `src/lib/supabase/server.ts`: Client mit Nutzer-Rechten. `admin.ts`: Client mit Secret Key (server-only)
- `src/components/layout/`: `UntereNavigation`, `BueroNavigation`, `BueroMobilMenue`, `NutzerBereich`
- `src/components/`: `PasswortFeld` (mit Auge), `FormularMeldung`, `Platzhalter`, `AppLogo`, `Feld` + `Auswahl` (Beschriftung/Hinweis bzw. natives Select, 48 px)
- `src/lib/formular.ts`: `abschicken()` für Formulare mit kontrollierten Feldern
- `src/lib/pwa.ts`: Versionsvergleich, Speicher für das Installations-Angebot. `src/components/pwa-helfer.tsx`, `src/components/app-installieren.tsx`. `src/app/api/version/route.ts`
- `src/lib/passwort.ts`: `startpasswortErzeugen()`. `src/lib/nutzer-schema.ts`: zod-Schemas für die Nutzerverwaltung
- `scripts/admin-anlegen.ts`: ersten Admin anlegen. `scripts/seed.ts` + `seed-daten.ts`: Testdaten
- `src/app/buero/plantafel/`: `page.tsx` + `einteilung.tsx` (Tag), `woche/`, `monat/`, `kalender.tsx`, `termine/` (+ `neu`, `[id]`), `tabs.tsx`, `actions.ts`, `spracheingabe.tsx`. Termine der Mitarbeiter: `(mitarbeiter)/termine/` (Seiten, `actions.ts`, `termin-formular.tsx`, wird auch vom Büro genutzt).
- `tests/rls/`: `00` Login-Adresse, `01` Funktionsrechte, `02` Rollen & Sperren, `03` Projekte/Kunden/Mitglieder/Fahrzeuge/Status/Löschen/ohne Login, `04` Phase 1 (Kollegen hinzufügen, Einteilung, Zeiten + Sperrfrist + mehrere auf einmal/erneut senden, Einstellungen, Urlaub, Notizen/Material/Aufmaß inkl. Freischalten + Abhaken, Fotos-Storage). Stopps (mehrere Baustellen pro Auto, Zeit, automatische Mitgliedschaft) und Termine (Rechte, Hinweis) sind in `04` getestet. Kontakte (neue Felder, Rechte) sind in `04` getestet. Fahrzeuge anlegen (Büro/Admin ja, Mitarbeiter nein) ist in `04` getestet. Archiv-Lesen ist in `04` getestet. Das Soll-/Konto-Feld im Profil (nur Admin ändert, Mitarbeiter sehen das eigene) ist in `04` getestet. Katalog (Rechte, berechneter VK, Ordner-Regeln) steht in `tests/rls/05-katalog.test.ts`. Angebote, Bausteine, Sperre nach dem Versand, Bilder-Bucket, Arbeitsanweisung und die Projektrechte der Mitarbeiter stehen in `tests/rls/06-angebote.test.ts` (21 Tests). Der Projekt-Chat (Rechte, Anhänge, Neu-Zähler) steht in `tests/rls/12-chat.test.ts`, die Berichte in `tests/rls/13-berichte.test.ts`. Der CSV-Import ist per Unit-Tests und im Browser geprüft. Insgesamt rund 130 Tests. Einzelne Datei: `npx vitest run --config vitest.rls.config.mts tests/rls/04-…` (spart Logins)
- Supabase-Regel: Wer per `insert(...).select()` einen Datensatz zurückliest, braucht auch das **Leserecht** darauf, sonst kommt „violates row-level security policy“, obwohl das Anlegen selbst erlaubt wäre.
- `src/components/ui/`: shadcn/ui-Komponenten
- `src/lib/format.ts`: deutsche Formatierung (`formatDatum`, `formatDatumZeit`, `formatUhrzeit`, `formatBetrag`, `formatZahl`; leere Werte → „–“)
- `.env.example`: Vorlage der Umgebungsvariablen (ohne Werte)
- `.claude/launch.json`: Dev-Server für die Vorschau im Claude-Browser
- `src/lib/login.ts`: Benutzername ↔ interne Login-Adresse, Benutzername-Vorschlag
- `src/lib/nutzer.ts`: `nutzerAnlegen()`, der einzige Weg, Nutzer anzulegen (braucht einen Client mit Secret Key)
- `src/lib/supabase/database.types.ts`: generierte DB-Typen (nicht von Hand ändern)
- `supabase/migrations/`: Datenbank-Migrationen. `supabase/config.toml` dokumentiert die Auth-Einstellungen (wir nutzen kein lokales Supabase).
- `tests/rls/`: Datenbank-Tests (`hilfen.ts` mit `testNutzerAnlegen()`, `einloggen()` …)
- `docs/`: Anleitungen für Mika (ab 0.7)

## Go-Live-Checkliste (bevor Mitarbeiter mit echten Daten arbeiten)
- Vercel **Pro** (Hobby ist nur für nicht-kommerzielle Nutzung)
- Supabase **Pro** für `brinkmann-live` (tägliche Backups) + zusätzlicher Export + Restore-Anleitung
- AVV/DPA mit Supabase und Vercel abschließen
- Admin-Zugänge für Ralf und Mika in live

## Offene Fragen
- **Aufmaß:** Abzüge (Fenster/Türen) gelten für die ganze Zeile (Mika: „lass so“, `src/lib/aufmass.ts`). Leibungen werden noch nicht extra erfasst.
- **Urlaub:** Feiertage werden seit 3.4c abgezogen und nicht gebucht. Offen: freie Tage von Teilzeitkräften zählen beim Anspruch noch als Urlaubstag. Die übrigen Mitarbeiter (außer Christian 30, Sebastian/Carmen/Manuel 28) haben noch keinen Anspruch eingetragen – Mika/Ralf tragen ihn in der Nutzerverwaltung ein, sobald die echten Nutzer angelegt sind.
- **Höchste Projektnummer in Plancraft** (Startwert, Admin trägt sie unter Einstellungen → Nummernkreise ein). Das Format der Projekt- und Kundennummern ist geklärt.
- Überstundenregeln sind mit 3.4b geklärt. Offen: Soll-Historie (Änderung des Arbeitsvertrags), Zuschläge für Feiertags-/Wochenendarbeit
- Firmenlogo und Farben: Logo ist da (Mika hat es am 18.10.2026 im Chat geschickt, Upload macht er selbst unter Einstellungen → Firmendaten → Logo). **Firmenfarbe: Grün und Schwarz.** Das Logo, das Mika am 18.10.2026 geschickt hat (`scripts/logo-quelle.png`), ist ein **knalliges Neon-Grün (etwa #80FF00)** mit Schwarz; das erste Logo aus Downloads war gedeckter (etwa #A0BF3C). **Entschieden (Mika, 18.10.2026): Das Neon-Grün aus dem Logo gilt für Knöpfe und Akzente.**

**Design (18.10.2026, nach Mikas Plancraft-Aufnahmen):** Aufbau wie Plancraft. Farben nur in `src/app/globals.css` (Variablen): `--primary` = Neon-Grün (oklch(0.9 0.26 135)) **mit dunkler Schrift**, Seitenleiste fast schwarz (`--sidebar`), Grund hellgrau (`--background`), Karten weiß. **Nie `text-primary` auf hellem Grund** (Neon-Schrift ist dort nicht lesbar): Links sind dunkel und unterstrichen, aktive Navigation am Handy hat einen grünen Balken oben, in der dunklen Seitenleiste ist das aktive Symbol grün. Alle Kästen mit `rounded-xl border` bzw. `rounded-lg border` werden per Regel in der Ebene `base` (globals.css) automatisch weiß; eigene `bg-…`-Klassen gewinnen weiterhin. Das Logo steht in der Seitenleiste auf einer weißen Plakette (`AppLogo`). **Statuspillen** (`src/components/status-pille.tsx`: heller Grund und Punkt in der Statusfarbe) in Projektlisten und Projektseite. Das **Dashboard** hat zusätzlich „Zuletzt bearbeitete Projekte“ und **Wetter** (Open-Meteo, kostenlos, ohne Schlüssel, 30 Minuten zwischengespeichert, nur Koordinaten von Saterland gehen raus; `src/lib/wetter.ts`, `wetter-daten.ts`). **Noch nicht im neuen Stil geprüft:** alle übrigen Seiten (Plantafel, Kalender, Katalog, Angebots- und Rechnungseditor, Einstellungen, PDF-Vorschau); sie übernehmen die Farben automatisch, Feinheiten müssen im Browser nachgezogen werden. Aus Plancraft noch offen: Angebots-Mail im Stil von Plancraft (Logo, grüner Knopf „Ihr Angebot ansehen“, Online-Ansicht mit PDF-Download), Einheiten-Liste und Standard-Einheiten (Plancraft: Dose, Eimer, kg, km, kWp, Lfm., Liter, m², m³, Min., ml, Pkg., psch., Rolle, Sack, Std., Stk., Tube; neue Position Stk., Lohn Min., Material m², Geräte/Fremdleistungen/Sonstiges psch.).
- Abschlags-/Schlussrechnungen: klären mit dem Steuerberater (Phase 5)
