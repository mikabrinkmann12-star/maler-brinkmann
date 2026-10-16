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
- **Keine Rechnungsnummern und keine Rechnungs-PDFs selbst erzeugen.** Rechnungen laufen ausschließlich über die Lexware Office API (Phase 5), Grund: GoBD/E-Rechnung. `invoices` ist nur ein Spiegel der Lexware-Daten. Abschlagsrechnungen nicht steuerlich „nachbauen“, das wird mit dem Steuerberater geklärt.
- **Jede Tabelle hat Row Level Security (RLS).** Rechte werden serverseitig durchgesetzt (RLS + Server-Checks), nie nur im UI versteckt.
- **`profiles.rolle` ist die einzige Quelle für die Rolle.** `app_metadata`/`user_metadata` werden nirgends gelesen, auch nicht beim Anlegen. Nie JWT-Claims für Rechte nutzen. `requireRole()` liest Rolle, `aktiv` und `muss_passwort_aendern` bei jeder Anfrage frisch aus `profiles`.
- **Bereits eingespielte Migrationen nie ändern**, stattdessen eine neue Migration anlegen.
- **RLS-Hilfsfunktionen** (`ist_admin()`, `ist_buero_oder_admin()`, `ist_projektmitglied()` …) sind `SECURITY DEFINER`, `STABLE`, mit `set search_path = ''` und voll qualifizierten Namen. Sie zählen nur aktive Nutzer. Rechte: `REVOKE EXECUTE … FROM PUBLIC, anon` und `GRANT EXECUTE … TO authenticated`.
- **Admin-Funktionen** (z. B. `nutzer_sessions_beenden()`): `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` und `GRANT EXECUTE … TO service_role`. Trigger-Funktionen: `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`.
- **Jede Seite und jede Server Action mit Daten ruft selbst `requireUser()` bzw. `requireRole()` auf** (`src/lib/auth.ts`). Layouts prüfen zwar auch, werden aber bei Navigation innerhalb des Layouts nicht neu ausgeführt.
- Der **Admin-Client** (`src/lib/supabase/admin.ts`, Secret Key, umgeht RLS) nur nach `requireRole(["admin"])` verwenden. Einzige Ausnahme: Das eigene `muss_passwort_aendern` nach erfolgreichem Passwortwechsel zurücksetzen.
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
  - `src/app/manifest.ts` („Maler Brinkmann“, standalone, theme `#171717`). Icons liegen in `public/icons/` (192, 512, maskable 512), dazu `src/app/icon.png` (Tab) und `src/app/apple-icon.png` (iPhone). Alle werden per `npm run icons` aus dem Platzhalter „MB“ erzeugt. Fürs echte Logo `scripts/icons-erzeugen.ts` anpassen.
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

- Admin/Büro arbeiten in der **Büro-Ansicht** (Sidebar) und können per **Umschalter** in die Mitarbeiter-Ansicht wechseln (eigene Einsätze/Zeiten).
- Mitarbeiter haben nur die **Mitarbeiter-Ansicht** (Bottom-Navigation) und keinen Zugriff auf `/buero`.

## Login & Nutzer
- Login mit **Benutzername + Passwort** (keine E-Mail nötig). Die interne Auth-E-Mail lautet `<benutzername>@<LOGIN_EMAIL_DOMAIN>`, mit `LOGIN_EMAIL_DOMAIN=login.maler-brinkmann.de` (Firmendomain: `maler-brinkmann.de`). An diese Adressen wird nie etwas geschickt, und es ist keine DNS-Einrichtung nötig.
- **Öffentliche Registrierung ist aus.** Nutzer legt nur der Admin an, immer über `nutzerAnlegen()` in `src/lib/nutzer.ts`:
  1. Admin-API `createUser` mit `email_confirm: true`.
  2. Der DB-Trigger `neuer_auth_nutzer` legt das Profil mit sicheren Standardwerten an: Benutzername aus der Login-Adresse, Rolle `mitarbeiter`, `muss_passwort_aendern = true`.
  3. Der Server setzt Name, Rolle usw. direkt in `profiles`. Schlägt das fehl, wird der Login wieder gelöscht.
  (Hintergrund: Supabase schreibt `app_metadata` erst nach dem INSERT, deshalb liest der Trigger keine Metadaten.)
- Nutzer **nicht** über das Supabase-Dashboard „Add user“ anlegen, denn dann fehlen Name und Rolle.
- **Erster Login** → Pflicht-Passwortwechsel (mind. **10 Zeichen**, nicht das Startpasswort). Das Flag setzt erst der Server zurück, nachdem `auth.updateUser` erfolgreich war.
- Man bleibt **immer eingeloggt**, es gibt keinen „Eingeloggt bleiben“-Schalter. Abmelden geht nur auf dem aktuellen Gerät (`signOut({ scope: "local" })`).
- Ablauf im Code: `src/proxy.ts` erneuert bei jeder Anfrage die Session und schickt Nicht-Eingeloggte nach `/login`. `ladeSitzung()` liefert `abgemeldet` / `gesperrt` (Profil per RLS nicht lesbar = deaktiviert) / `ok`. `requireUser()` leitet entsprechend um: `/login`, `/login?grund=gesperrt` oder `/passwort-aendern`.
- Login-Fehler: „Benutzername oder Passwort ist falsch“ erscheint **nur** bei `invalid_credentials` (gilt für unbekannten Benutzer und falsches Passwort gleichermaßen). Bei Bann (`user_banned`) erscheint „Zugang gesperrt“, bei Rate-Limit (429) „Zu viele Versuche“. **Alles andere** (z. B. „Invalid API key“, fehlende Variable) zeigt „technischer Fehler“ und wird mit `console.error("[login] …")` ins Vercel-Protokoll geschrieben. Hintergrund: Vorher sah ein falscher Vercel-Key aus wie ein falsches Passwort.
- Ob die Online-App die richtige Datenbank nutzt, testet man so: Anmeldung mit falschem Passwort ergibt „falsch“ (Verbindung ok), ein dev-Demo-Zugang wird abgelehnt (also nicht dev).
- **Deaktivieren** = `profiles.aktiv = false` + Supabase-User bannen + `nutzer_sessions_beenden()`. **Aktivieren** = Bann aufheben + `aktiv = true`.
- Schutz: Ein Admin kann sich nicht selbst die Admin-Rolle nehmen oder sich deaktivieren, und es bleibt immer mindestens ein aktiver Admin.
- Passwort vergessen → Admin setzt ein neues (danach muss der Nutzer es wieder ändern).
- **Nutzerverwaltung** (`/buero/einstellungen/benutzer`, nur Admin, Aktionen in `actions.ts` daneben):
  - Anlegen mit vorgeschlagenem Benutzernamen und lesbarem Startpasswort (`startpasswortErzeugen()`, z. B. `Pinsel-Deich-Walze-47`). Die Zugangsdaten werden **nur einmal** angezeigt (Kopieren-Knopf) und nirgends gespeichert.
  - Bearbeiten: Name, Telefon, E-Mail, Rolle. Der Benutzername ist nicht änderbar. Die eigene Rolle ist gesperrt.
  - Passwort zurücksetzen: neues Startpasswort, `muss_passwort_aendern = true`, alle Sessions beenden.
  - Sperren/Entsperren, jeweils mit Bestätigungsschritt. Sich selbst sperren geht nicht.
  - Profil-Änderungen laufen über den Client des eingeloggten Admins (RLS, Admin-Schutz-Trigger, Protokoll mit `geaendert_von`). Der Admin-Client wird nur für Supabase Auth benutzt (anlegen, Passwort, Bann).
  - Eingaben werden serverseitig mit zod geprüft (`src/lib/nutzer-schema.ts`).

## Datenmodell
Legende: ✅ angelegt · ⏳ kommt in der genannten Phase

- ✅ **profiles**: id (= auth.users.id), benutzername (unique, `^[a-z0-9][a-z0-9._-]{1,30}$`), vorname, nachname, rolle (`app_rolle`), email (optional, Kontakt), telefon, aktiv, muss_passwort_aendern, arbeitszeitmodell (Text, Details in Phase 3), urlaubstage_jahr (Anspruch pro Jahr, 0–60, null = unbekannt)
- ✅ **contacts**: kundennummer, typ (`firma`/`privat`), firmenname, anrede, vorname, nachname, strasse, plz, ort, ansprechpartner, telefon, mobil, email, notizen, lexware_contact_id, archiviert_am, created_by
- ✅ **projects**: projektnummer, name, contact_id, baustelle_strasse/plz/ort, status_id, start_datum, end_datum, beschreibung, buero_ansprechpartner_id, archiviert_am, created_by
- ✅ **project_statuses**: name, farbe (#RRGGBB), sortierung, aktiv. Start: Entwurf, Angebot, Auftrag erteilt, In Arbeit, Rechnung angelegt, Rechnung geschrieben, Abgeschlossen, Anders vergeben, Abgelehnt von uns
- ✅ **project_members**: project_id, user_id, added_by, added_at (PK project_id + user_id)
- ✅ **vehicles**: name, kennzeichen, aktiv
- ✅ **audit_log**: tabelle, datensatz_id, aktion, alt, neu, geaendert_von, geaendert_am. Trigger `protokolliere_aenderung` hängt an allen Tabellen oben.

**Rechte (RLS), Stand 0.2:**
| Tabelle | Mitarbeiter | Büro | Admin |
|---|---|---|---|
| profiles | eigenes lesen | alle lesen | alle lesen + ändern |
| contacts | Kunden eigener Projekte lesen | lesen, anlegen, ändern | wie Büro |
| projects | eigene (Mitglied) lesen | lesen, anlegen, ändern | wie Büro |
| project_members | Mitglieder eigener Projekte lesen | lesen, anlegen, entfernen | wie Büro |
| project_statuses, vehicles | lesen | lesen | lesen, anlegen, ändern (Einstellungen) |
| audit_log | – | lesen | lesen |

- Kein DELETE auf contacts/projects (archivieren). Deaktivierte Nutzer sehen nichts.
- Trigger `schuetze_admins`: Ein Admin kann sich nicht selbst herabstufen/deaktivieren, und es bleibt immer mindestens ein aktiver Admin.
- Admin-Funktion `nutzer_sessions_beenden(user_id)`: nur `service_role`.
**Phase-1-Tabellen** (Migrationen `…200000_phase1_mitarbeiter_app`, `…210000_zeiten_ersteller_sieht`, `…080000_einsatz_eindeutig`, in **dev und live**. Grundsatz: Wenn Code eine neue Tabelle braucht, muss die Migration **vor dem Push** auch in live sein, sonst bricht die Online-Version ab):
- ✅ **app_settings**: schluessel, wert (jsonb). `zeiterfassung` = { erlaubte_arten, standard_beginn 06:30, standard_ende 15:45, standard_pause_min 45, kulanz_tage 3 }. Alle lesen, nur der Admin ändert.
- ✅ **assignments** (Tageseinsatz eines Autos: datum, vehicle_id, notiz = Büro-Notiz für „Heute“) + **assignment_members** (das feste Team) + **assignment_stops** (Baustellen/Stopps: assignment_id, project_id, sortierung, zeit + zeit_art `um`/`ab` optional, notiz; eine Baustelle nur einmal pro Auto). Seit Phase 2 hat `assignments` **kein** `project_id` mehr. Trigger: Eingeteilte werden automatisch project_members **aller** Stopps des Einsatzes (egal ob zuerst Team oder Stopp gespeichert wird).
- ✅ **appointments** (datum, titel, ort, zeit, project_id, notiz, erstellt_von, archiviert_am) + **appointment_members**. RLS: Büro/Admin alles; Mitarbeiter sehen Termine, in denen sie stehen oder die sie angelegt haben, legen nur eigene an (Baustelle nur aus eigenen Projekten), tragen nur sich selbst ein, ändern/archivieren nur eigene; niemand löscht. Trigger `benachrichtige_termin`: Mitarbeiter-Termin → Hinweis fürs Büro (`notifications.typ = 'termin'`). Eindeutig: ein Einsatz pro (datum, vehicle_id). Einsätze ohne Firmenwagen (vehicle_id null) sind ausgenommen, die UI zeigt davon aber nur einen pro Tag.
- ✅ **time_entries**: user_id, project_id, datum, von, bis, pause_min, stunden (bei von/bis per Trigger berechnet, sonst Pflicht), art (`zeit_art`: arbeitszeit, fahrtzeit, urlaub, unbezahlter_urlaub, krank, schlechtwetter, kurzarbeit, sonstiges), beschreibung, erstellt_von (unveränderlich), bearbeitet_von, archiviert_am. Arbeits-/Fahrtzeit brauchen ein Projekt.
- ✅ **leave_requests**: user_id, von, bis, art (urlaub/unbezahlter_urlaub), bemerkung, status (`offen/genehmigt/abgelehnt/zurueckgezogen`), antwort, entschieden_von/_am (setzt der Trigger)
- ✅ **project_notes** (text), **project_photos** (storage_pfad `<project_id>/<datei>` im privaten Bucket `projektfotos`, kategorie vorher/nachher/mangel/sonstiges, kommentar, Maße), **material_usage** (material als Text, material_id ab Phase 3, menge, einheit, erledigt_am), **measurements** (raum, position, einheit m2/m/stk, laenge, hoehe, anzahl, menge = von der App berechnet) + **measurement_deductions** (bezeichnung, breite, hoehe, anzahl). Alle mit erstellt_von (unveränderlich) und archiviert_am.
- ✅ **notifications**: Büro-Posteingang (typ, text, project_id, ausgeloest_von, gelesen_am). Wird nur per Trigger angelegt: `kollege_hinzugefuegt` (wenn ein Mitarbeiter jemanden hinzufügt), `urlaubsantrag`.

**Rechte Phase 1 (RLS):**
| Bereich | Mitarbeiter | Büro | Admin |
|---|---|---|---|
| Kollegen hinzufügen (project_members) | nur zu **eigenen**, nicht archivierten Projekten, `added_by` = er selbst | anlegen + entfernen | wie Büro |
| assignments (+members, +stops) | eigene Einsätze inkl. Kollegen und Stopps lesen | alles | alles |
| appointments (+members) | eigene lesen/anlegen/ändern, nur sich selbst eintragen | alle lesen/anlegen/ändern | wie Büro |
| time_entries | eigene + selbst für andere eingetragene lesen. Anlegen für sich oder Kollegen **derselben Baustelle**, nur erlaubte Arten (`zeit_art_erlaubt`) und innerhalb der Sperrfrist (`zeit_noch_aenderbar`: laufender Monat, bis Kulanztag auch Vormonat, nie Zukunft). Ändern nur eigene, innerhalb der Sperrfrist | alles lesen/anlegen/ändern | wie Büro |
| leave_requests | eigene lesen/anlegen (offen), zurückziehen solange offen | alle lesen, **nicht** entscheiden | entscheiden |
| Notizen/Fotos/Material/Aufmaß | lesen + anlegen als Projektmitglied, eigene ändern | alles | alles |
| Fotos im Storage | lesen/hochladen nur im Ordner eigener Projekte | alle | alle |
| notifications | – | lesen, als gelesen markieren | wie Büro |
- Löschen: niemand bei Zeiten, Urlaub, Notizen, Fotos, Material, Aufmaß (archivieren). Aufmaß-Abzüge und Einsätze dürfen gelöscht werden.
- `kollegen()`: Name + Telefon aller aktiven Nutzer für Eingeloggte (statt breitem Lesezugriff auf profiles).
- ⏳ (3) **materials**: Artikelnr., Lieferant, Einheit, Beschreibung, EK, Zuschlag %, VK, Ordner
- ⏳ (3) **services** (Leistungen): Einheit, Beschreibung/Langtext, Kosten, Zuschlag %, VK, Ordner
- ⏳ (4) **quotes** + **quote_items**
- ⏳ (5) **invoices**: nur Spiegel der Lexware-Daten (lexware_id, Typ, Nummer, Status, Betrag, offen, Fälligkeit, PDF-Link)

## Kernfeature: Kollegen zur Baustelle hinzufügen (Phase 1, höchste Priorität)
- Ein Mitarbeiter, der einem Projekt zugeordnet ist, kann andere Mitarbeiter hinzufügen. Danach können diese sofort Zeiten auf dem Projekt eintragen.
- Das geht nur für Projekte, auf denen der Hinzufügende selbst eingetragen ist (über RLS durchgesetzt).
- Protokoll: Wer hat wen wann hinzugefügt. Sichtbar für Admin/Büro im Projekt-Verlauf + als Benachrichtigung.
- Admin/Büro können die Zuordnung wieder entfernen.

## Phasenplan
### Phase 0 – Grundgerüst (✅ fertig, online seit 15.10.2026)
- [x] 0.1 CLAUDE.md, Git, Next.js + Tailwind + shadcn/ui, deutsche Formatierung
- [x] 0.2 Supabase-Migration: Basistabellen + RLS + Audit, Test der Fake-Login-Adresse
- [x] 0.3 Login (Benutzername), Pflicht-Passwortwechsel, Rollen, Layouts (Sidebar/Bottom-Nav, Umschalter), Skript `admin:anlegen`
- [x] 0.4 Nutzerverwaltung (nur Admin): anlegen, bearbeiten, Rolle ändern, Passwort zurücksetzen, sperren/entsperren
- [x] 0.5 PWA (Manifest, Icons, Service Worker), Hinweis „Neue Version – neu laden“, „App installieren“ unter Mehr
- [x] 0.6 Seed-Daten (`npm run seed`) + RLS-Tests für Projekte, Kunden, Mitglieder, Fahrzeuge, Status (37 DB-Tests)
- [x] 0.7 Deployment (GitHub → Vercel → Supabase live) + `docs/SETUP.md`
- Vercel-Variablen: Production → live, Preview → dev (seit 15.10.2026, Kontrolle mit `npx vercel@latest env ls`). `LOGIN_EMAIL_DOMAIN` gilt für beide.
- Live-Admin für Mika: `mika.brinkmann` (angelegt 15.10.2026, Login auf dem iPhone getestet). Offen: Zugang für Ralf (in der App unter Benutzer & Rollen).
- `.env.live` (nicht im Repo) enthält die live-Zugangsdaten für Skripte wie `admin:anlegen`. Die Keys holt man mit `npx supabase projects api-keys --project-ref tezveryzixrysviapmal --reveal`.

### Phase 1 – Mitarbeiter-App (🔄 in Arbeit)
- [x] 1.1 Datenbank, RLS und Tests (nur dev)
- [x] 1.2 Einteilung fürs Büro + Spracheingabe (Namen-Erkennung)
  - Seite `/buero/plantafel` (Menü „Einteilung“): Datum per `?datum=JJJJ-MM-TT`, eine Karte pro aktivem Auto + „Ohne Firmenwagen“, Baustelle (aktuelle Status oben), Mitarbeiter-Chips mit Doppelt-Hinweis, Team-Notiz, „Alle speichern“-Leiste, „Wie gestern“ (letzter Tag mit Einsätzen, max. 7 Tage zurück, nur freie Autos, ohne Notizen).
  - Server-Aktionen `einsaetzeSpeichern`, `wieGestern` (`src/app/buero/plantafel/actions.ts`), Rechte Büro/Admin.
  - Spracheingabe: `src/lib/sprache.ts` (Web Speech API, de-DE) → Textfeld (auch zum Tippen) → `einteilungErkennen()` in `src/lib/einteilung-erkennung.ts` (Namen-Erkennung, getestet) → Vorschlag → „Übernehmen“ füllt Karten (genannte Leute wechseln dabei das Auto) → speichern erst nach Prüfung. Erkennung: Autos über Name/Kennzeichen (Zahlwörter „eins“ → 1), Mitarbeiter über Vor-/Nachname, Baustellen über Name/Kunde/Ort/Straße, 1 Tippfehler erlaubt ab 5 Buchstaben, Hinweise bei Mehrdeutigkeit statt raten. Gruppen-Regel: neue Gruppe, wenn eine Art erneut auftaucht (außer direkt folgende Mitarbeiter).
  - `src/lib/datum.ts`: `heuteIso()`, `tageVerschieben()`, `istIsoDatum()`.
- [x] 1.3 „Heute“, „Meine Baustellen“, Kollegen hinzufügen, Büro-Hinweise
  - `/heute`: eigene Einsätze des Tages (Auto, Baustelle, „Navigation starten“ = Google-Maps-Link, Büro-Notiz, Team mit Anruf-Knöpfen, Ansprechpartner Kunde + Büro, Knopf „Zeit eintragen“ → /zeiten). Ohne Einsatz: Hinweis + Link „Meine Baustellen“.
  - `/baustellen`: nur Projekte, auf denen ICH Mitglied bin (auch für Büro/Admin in der Mitarbeiter-Ansicht), nicht archiviert, heutige zuerst, Status-Farbe.
  - `/baustellen/[id]`: Kopf, Adresse + Navigation, Beschreibung, Ansprechpartner, Team. „Kollegen hinzufügen“ (Bottom-Sheet, nur wenn ich Mitglied bin und das Projekt nicht archiviert ist), Entfernen-Knopf nur für Büro/Admin. Aktionen in `src/app/(mitarbeiter)/baustellen/actions.ts`.
  - `/buero`: Kasten „Hinweise“ (ungelesene notifications, „gelesen“ / „Alle gelesen“, `src/app/buero/actions.ts`).
  - Hilfen: `src/lib/projekt.ts` (adresseText, mapsLink, telLink, kontaktName, getestet), `src/lib/mitarbeiter-daten.ts` (kollegenLaden, meineProjektIds, meineEinsaetze – IMMER explizit nach dem Nutzer filtern), `src/components/anruf-link.tsx`.
  - Test-Aufräumen robuster: `testNutzerLoeschen` entfernt vorher notifications/project_members des Nutzers.
- [x] 1.4 Zeit eintragen, „Meine Zeiten“, Einstellungen „Zeiterfassung“, Entwürfe gegen Datenverlust
  - `/zeiten` („Meine Zeiten“): Monatsliste (`?monat=JJJJ-MM`) mit Tages- und Monatssumme (je Art), eigene Zeiten + „Für Kollege …“ (selbst für andere eingetragen, nur lesen), Schloss = nicht mehr änderbar.
  - `/zeiten/neu` (`?projekt=<id>` von „Heute“/Baustelle): Tag (Heute/Gestern/Datum, Mitarbeiter nur innerhalb der Sperrfrist), Art (nur erlaubte), Baustelle (Einsatz des Tages vorausgewählt, bei zwei Einsätzen die noch offene), Von–bis + Pause-Knöpfe oder „Nur Stunden“, Kollegen derselben Baustelle ankreuzen (jeder bekommt einen eigenen Eintrag). Zweiter Eintrag am Tag: Beginn = letztes Ende, keine zweite Pause. Überschneidungen werden vorher angezeigt und vom Server abgelehnt (geprüft gegen alle Zeiten, die der Nutzer sehen darf).
  - `/zeiten/[id]`: eigene Zeit ändern oder löschen (= archivieren), sonst nur Ansicht mit Grund.
  - Freitag (6:30–12:45, 15 Min) hat eigene Standardzeiten (`tagesStandard()` in `src/lib/zeiten.ts`, Einstellungen „Zeiterfassung“). Die Überlappungs-Regel steht auch in der DB (siehe Entscheidungen).
  - Server-Aktionen `zeitenAnlegen`, `zeitAendern`, `zeitArchivieren` in `src/app/(mitarbeiter)/zeiten/actions.ts`. Sie sind **idempotent**: Die App erzeugt die IDs neuer Einträge selbst, ein zweites Senden speichert nichts doppelt.
  - **Warteschlange gegen Datenverlust** (`src/lib/warteschlange.ts`, `zeiten/senden.ts`, `zeiten/warteschlange.tsx`): Jede Eingabe wird VOR dem Senden im localStorage (pro Nutzer) abgelegt und erst nach Erfolg entfernt. Bei Funkloch erscheint „Noch nicht gespeichert“ (auf Heute, Zeiten, Formular), Neuversuch beim Öffnen, bei „online“ und jede Minute. Lehnt der Server ab, bleibt die Meldung stehen, bis man verwirft. Im Browser getestet (Senden blockiert → gemerkt → nachgesendet).
  - Admin-Seite `/buero/einstellungen/zeiterfassung`: erlaubte Arten, Standardzeiten, Kulanztage (0–15). Speichert per upsert mit `updated_by`.
  - Logik in `src/lib/zeiten.ts` (Sperrfrist, Stunden, Vorschläge – spiegelt die DB-Regeln) und `src/lib/zeit-schema.ts` (zod), beide getestet. Anzeige der Stunden als „8:30 Std“ (`formatStunden`).
- [x] 1.5 Fotos + Notizen (auf `/baustellen/[id]`, Schnellzugriff „Zeit / Fotos / Notizen“ oben)
  - Fotos: „Foto aufnehmen“ (Kamera) oder „Aus Galerie“ (bis 10), Art Vorher/Nachher/Mangel/Sonstiges, Kommentar. Im Browser verkleinert (`src/lib/bild.ts`: max. 1920 px, JPEG 0,82, dazu Vorschau 480 px als `<id>_klein.jpg`; GPS-Daten fallen dabei weg). Upload direkt aus dem Browser in den privaten Bucket (`src/lib/supabase/client.ts`, RLS), danach legt `fotoSpeichern` den Datensatz an (prüft, dass die Datei da ist). Anzeige über signierte Adressen (1 Std), Filter nach Art, Großansicht, eigene löschen (= archivieren).
  - Fotos, die nicht hochgeladen werden konnten, bleiben in **IndexedDB** (`src/lib/foto-speicher.ts`), weil Kamera-Fotos auf dem iPhone sonst weg wären. Neuversuch beim Öffnen, bei Netz und jede Minute. Im Browser getestet (Upload blockiert → neu geladen → automatisch hochgeladen).
  - Notizen: Text bis 2.000 Zeichen, neueste zuerst, eigene löschen (= archivieren), läuft über die Warteschlange.
  - Server-Aktionen `notizAnlegen`, `notizArchivieren`, `fotoSpeichern`, `fotoArchivieren` in `baustellen/actions.ts` (idempotent). Die Warteschlange liegt jetzt allgemein in `src/app/(mitarbeiter)/senden.ts` + `warteschlange.tsx`; neue Aktionen dort eintragen.
  - Büro/Admin sehen und löschen alle Fotos/Notizen. Benachrichtigungen fürs Büro bei neuen Fotos gibt es noch nicht (bräuchte eine Migration).
- [x] 1.6 Material + Aufmaß (VOB)
  - Material (Baustellen-Seite, Abschnitt „Material“): freier Text, Menge (deutsches Komma), Einheit (Stk, Eimer, Liter, kg, Rolle, Kartusche, Packung, Sack, m, m²), Bemerkung. Über die Warteschlange. Büro/Admin haken ab (`materialErledigt`), offene Meldungen aller Baustellen stehen im Kasten „Material-Meldungen“ auf `/buero`.
  - Aufmaß: `/baustellen/[id]/aufmass` (Summen je Position + Zeilen je Raum), `/aufmass/neu`, `/aufmass/[mid]` (ändern/löschen). Einheit m² (Länge × Höhe × Anzahl − Abzüge), m (Länge × Anzahl) oder Stück. Abzüge mit Live-Anzeige „übermessen“ / „wird abgezogen“. „+ Weitere“ speichert und behält Raum/Position (nächste Wand).
  - Rechnung nur in `src/lib/aufmass.ts` (getestet), der Server rechnet vor dem Speichern selbst nach. Öffnungen ≤ 2,5 m² Einzelgröße werden übermessen. **Annahme:** Abzüge gelten für die ganze Zeile (nicht × Anzahl) – siehe Offene Fragen.
  - `aufmassSpeichern` (`baustellen/aufmass-actions.ts`): Zeile erst unsichtbar (archiviert) anlegen, Abzüge dazu, dann freischalten – nie halbe Zeilen. Ändern = neue Fassung, alte wird archiviert (Verlauf bleibt). Idempotent.
  - Hilfen: `src/lib/baustellen-daten.ts` (`baustelleMitRechten`, `aufmassLaden`).
- [x] 1.7 Urlaubsantrag + Genehmigung
  - Mitarbeiter: `/urlaub` (unter „Mehr“ → „Urlaub beantragen“): Urlaub/Unbezahlter Urlaub, von–bis, Bemerkung, Anzeige der Werktage (Mo–Fr, **Feiertage noch nicht abgezogen**). Eigene Anträge mit Status, Antwort, „Zurückziehen“ solange offen. Überschneidung mit eigenen offenen/genehmigten Anträgen wird abgelehnt. Über die Warteschlange.
  - Büro-Menü „Urlaub“ (`/buero/urlaub`): offene und entschiedene Anträge (letzte 60 Tage + Zukunft). **Nur der Admin** sieht „Genehmigen/Ablehnen“ (+ Antwort), das Büro nur lesen. Entscheider und Zeitpunkt setzt der DB-Trigger. Der Hinweis „… beantragt Urlaub“ auf `/buero` verlinkt dorthin.
  - Genehmigter Urlaub bucht automatisch Zeiten (siehe Entscheidungen), `time_entries.leave_request_id` verknüpft sie mit dem Antrag (nur der Admin/Trigger darf das setzen). Die Anzeige „Anspruch / genehmigt / Rest“ steht auf `/urlaub` und beim offenen Antrag im Büro (`src/lib/urlaub.ts`: `urlaubskonto`).
  - Aktionen: `urlaubBeantragen`, `urlaubZurueckziehen` (`(mitarbeiter)/urlaub/actions.ts`), `urlaubEntscheiden` (`buero/urlaub/actions.ts`, `requireRole(["admin"])`). Hilfen in `src/lib/urlaub.ts` (getestet).
- [ ] 1.8 Migrationen nach live, Test auf iPhone/Android (für 1.4–1.7 waren **keine** neuen Migrationen nötig, live ist auf dem Stand)

- Startseite „Heute“: Auto, Baustelle, wer ist dabei, Adresse (Link zu Google Maps), Ansprechpartner, Notizen vom Büro
- Meine Baustellen (nur eigene) + Kollegen hinzufügen (Kernfeature)
- Zeit eintragen: Baustelle vorausgewählt, von–bis, Pause, Art, optional Beschreibung. Mehrere Baustellen pro Tag möglich, max. 3–4 Taps im Normalfall. Eigene Zeiten der letzten Tage bearbeitbar (Sperrfrist vom Admin einstellbar)
- Fotos & Notizen (Kamera direkt, Bilder vor dem Upload komprimieren), Material melden, Aufmaß, Urlaubsantrag

**Entscheidung KI-Angebot (Mika, 16.10.2026):** Erst Angebotseditor und Rechner bauen, die KI-Schnittstelle austauschbar vorbereiten, echte KI erst nach Ralfs Entscheidung (Kosten pro Nutzung).

**Entscheidungen zu Phase 1 (mit Mika geklärt am 15.10.2026):**
- **Einteilung schon in Phase 1:** eine schlichte Büro-Seite pro Tag (Auto → Baustelle → Mitarbeiter, Knopf „wie gestern“), wird in Phase 2 durch die Plantafel ersetzt. Wer eingeteilt wird, wird automatisch Projektmitglied.
- **Spracheingabe auf der Einteilungs-Seite:** Spracherkennung des Browsers (Web Speech API, Audio geht an Google/Apple). Danach erkennt eine **Namen-Erkennung ohne externe KI** Mitarbeiter, Autos und Baustellen aus den bekannten Listen (unscharfer Abgleich, Füllwörter wie „ähm“ werden ignoriert) und füllt einen **Vorschlag** aus. Ralf/Büro prüft und speichert. Ohne Bestätigung wird nie etwas gespeichert. Diesen Teil austauschbar bauen (später echte KI, z. B. Claude, siehe Jarvis). Ollama geht auf Vercel nicht; Gratis-KIs mit Trainingsnutzung wegen Mitarbeiterdaten nicht verwenden.
- **Zeiterfassung:** Standard **6:30–15:45, 45 Min Pause** (= 8:30 Std). **Freitag: 6:30–12:45, 15 Min Pause** (= 6:00 Std), beides in den Einstellungen änderbar. Eingetragen wird nur die Pausendauer, nicht die Uhrzeit der Pause.
- **Zeiten dürfen sich nie überlappen** (Entscheidung 16.10.2026): Mehrere Einträge pro Tag sind erlaubt, aber 6:30–8:00 und 7:45–15:45 geht nicht; 6:30–7:45 und 7:45–15:45 geht. Gilt pro Person, egal wer einträgt – durchgesetzt von einer Exclusion-Constraint in der Datenbank (`time_entries_keine_ueberschneidung`, Fehlercode 23P01).
- **Urlaub:** Anspruch pro Mitarbeiter in Werktagen pro Kalenderjahr, **ohne Übertrag** (`profiles.urlaubstage_jahr`, pflegt der Admin in der Nutzerverwaltung; Christian 30, Sebastian/Carmen/Manuel 28). Genehmigter Urlaub wird **automatisch als Zeit gebucht** (Art Urlaub, Mo–Do 8:30 Std, Fr 6:00 Std laut Einstellungen; DB-Trigger `urlaub_zeiten_buchen`). Wird die Genehmigung zurückgenommen, werden die Einträge archiviert. Resturlaub = Anspruch − genehmigte Werktage des Jahres (unbezahlter Urlaub zählt nicht).
- **Sperrfrist:** Mitarbeiter dürfen eigene Zeiten bis **Monatsende** ändern, plus **Kulanz bis zum 3. des Folgemonats**. Danach nur noch das Büro. Serverseitig (RLS) durchsetzen.
- **Zeiten für Kollegen mit eintragen:** erlaubt für Kollegen **derselben Baustelle**. Jeder bekommt einen eigenen Eintrag (`erstellt_von` = wer eingetragen hat) und kann seinen danach selbst ändern.
- **Erlaubte Zeit-Arten für Mitarbeiter** stellt der Admin in den Einstellungen ein. Start: Arbeitszeit, Fahrtzeit, Schlechtwetter, Sonstiges. Das Büro darf immer alle Arten.
- Einstellungsseite **„Zeiterfassung“** (Admin): erlaubte Arten, Standardzeiten, Sperrfrist + Kulanztage.
- **Aufmaß:** Öffnungen bis **2,5 m²** werden automatisch **übermessen** (VOB/C DIN 18363), also nicht abgezogen, größere schon. Das wird im Aufmaß sichtbar markiert.
- **Urlaubsanträge genehmigt nur der Admin.** Das Büro sieht sie.
- **Material melden:** vorerst freier Text + Menge + Einheit. Die Katalogsuche kommt nach dem Import in Phase 3.

### Phase 2 – Plantafel (Einsatzplanung mit Autos) (✅ gebaut 16.10.2026, Migration `…160000` in dev und live)
- **Gebaut:**
  - `/buero/plantafel` mit Umschalter **Tag | Woche | Monat | Termine** (`tabs.tsx`).
  - **Tag:** Mitarbeiter-Leiste + Karten pro Auto. Mitarbeiter per **Drag & Drop** (`@dnd-kit/core`) von der Leiste oder zwischen Karten ziehen (zurück auf die Leiste = herausnehmen). Fallback ohne Ziehen: Auswahl „+ Mitarbeiter …“ je Karte. Pro Karte **mehrere Baustellen (Stopps)** mit Pfeilen zum Sortieren, optional Zeit („muss da sein um“ / „kann ab“) und Hinweis. Chips zeigen Urlaub/Krank (gelb), Termin und „doppelt“-Warnung. Termine des Tages mit „In Auto übernehmen“ (Personen + Baustelle). „Wie gestern“ kopiert Teams und Baustellen (nicht Zeiten/Notizen). Spracheingabe fügt Baustellen als Stopp hinzu. Logik in `src/lib/plantafel.ts` (getestet).
  - **Woche/Monat** (`kalender.tsx`, Logik `src/lib/kalender.ts`, Daten `kalender-daten.ts`): Zeilen pro Mitarbeiter oder pro Baustelle (`?ansicht=projekte`), Farbe = Baustelle, genehmigter Urlaub (grün), beantragter Urlaub (gestrichelt), Krank, Termine. Tippen auf einen Tag öffnet die Einteilung.
  - **Termine** (`appointments` + `appointment_members`): Mitarbeiter unter „Mehr → Meine Termine“ (`/termine`), das Büro unter `/buero/plantafel/termine` für alle Personen. Trägt ein Mitarbeiter etwas ein, bekommt das Büro einen Hinweis. Mitarbeiter sehen nur eigene, können sich nur selbst eintragen; das Büro sieht und plant alle. Auf „Heute“ steht der Kasten „Termine heute“.
  - **Heute:** Pro Stopp eine Baustellen-Karte mit Zeit-Hinweis, Navigation, Ansprechpartner und „Zeit eintragen“. Das Team gehört zum Auto.
- **Entschieden (Mika, 16.10.2026):** Ein Auto hat ein **festes Team** für alle Stopps des Tages. Die Mitarbeiter wählen die Reihenfolge selbst, außer das Büro schreibt eine Zeit dazu (um = muss da sein, ab = kann ab). Termine tragen alle ein.
- **Noch offen:** Drag & Drop wurde mit simulierten Mausereignissen am PC getestet, **nicht auf dem Handy**. Das Büro arbeitet normalerweise am PC, auf dem Handy gibt es die Auswahlfelder. „Termin automatisch vorbelegen“ ist eine Auswahl „In Auto übernehmen“ (welches Auto, bestimmt das Büro).
- Tagesansicht: Karten pro Auto, Baustelle + Mitarbeiter per Drag & Drop, „wie gestern“ kopieren
- Wochen-/Monatsansicht: Zeilen pro Mitarbeiter und Projekt, Urlaub/Krank sichtbar
- Einteilung erscheint sofort in „Heute“. Wer zugeteilt wird, wird automatisch project_member

- **Wunsch (Mika, 16.10.2026) – Kalender/Termine:** Ein Planer, in den auch Mitarbeiter Termine eintragen können (z. B. wenn Ralf sagt „Dienstag musst du zu von Garrel“). Diese Termine fließen in den „Auto-Plan“ ein: Macht Ralf die Tageseinteilung, ist der Termin dort schon gesetzt.
- **Wunsch – Auto-Plan:** Ein Auto kann an einem Tag **mehrere Baustellen** anfahren (Reihenfolge/Zeitfenster pro Stopp). Achtung: In der DB gilt heute „ein Einsatz pro (Datum, Auto)“ (Unique-Index `assignments_datum_fahrzeug_eindeutig`, Migration `…080000`). Das muss mit einer **neuen** Migration gelockert werden (z. B. Spalte `reihenfolge`), die Einteilungs-Seite, „Heute“ und `zeiten-daten.ts` (mehrere Einsätze pro Tag, steht schon teilweise drin) müssen mitziehen.
- Diese Wünsche werden gebaut, **wenn Phase 2 freigegeben ist**, nicht vorher. Offene Rückfragen dazu vorher klären .
  - **Entschieden (Mika, 16.10.2026):** Termine tragen **alle** ein (Mitarbeiter und Büro). Büro/Admin sehen alle Termine und planen sie in den Auto-Plan ein; Mitarbeiter sehen nur ihre eigenen.

### Phase 3 – Büro-Grundlagen + Import aus Plancraft
- Kontakte, Projekte (Liste, Suche, Filter, Detailseite mit allem)
- Zeiten-Übersicht (Filter, Summen, Überstunden, Urlaub/Krank, CSV/Excel-Export für den Lohn)
- Stammdaten Materialien/Leistungen in Ordnern (EK + Zuschlag % → VK)
- Import-Tool (nur Admin): CSV/Excel mit Spalten-Zuordnung, Vorschau und Dubletten-Erkennung (Kontakte ~330, Projekte ~160, Materialien, Leistungen). **Vorher Mika nach dem Exportformat fragen.**
- DATANORM-Import (aktuell „Wilts 2025“, ca. 2.900 Artikel)
- **Wunsch (Mika): Auf archivierte Projekte zurückgreifen.** Projektliste mit Filter „Archiv“, archivierte Projekte ansehen/durchsuchen; Archiviert wird weiterhin nur per `archiviert_am`, nie gelöscht.
  - **Entschieden (Mika, 16.10.2026):** Archivierte Projekte sind **für alle Mitarbeiter lesbar**, nicht nur für die damals Eingetragenen (Beispiel: Sebastian war allein auf der Baustelle, Christian muss zum Nacharbeiten und sieht nach, welche Farbe „Fabton“ verwendet wurde, statt Sebastian anzurufen). Nur ansehen und suchen, **kein** Wiederaktivieren durch Mitarbeiter (das kann das Büro). Nicht gewählt: Vorlage für Angebote aus alten Projekten (kann später ergänzt werden).
  - **Kundendaten (Mika, 16.10.2026): Telefonnummer und Adresse des Kunden sind für alle Mitarbeiter sichtbar**, ebenso Notizen, Fotos, Material und Aufmaß archivierter Projekte (nur lesen).
  - **Technisch:** Das ändert die Rechte (RLS): Heute sehen Mitarbeiter nur Projekte, auf denen sie Mitglied sind. Nötig ist eine **neue Migration**: Mitarbeiter dürfen archivierte Projekte samt Notizen, Fotos (inkl. Speicher), Material und Aufmaß **lesen**, aber nichts ändern. Das schließt die Kontakte (`contacts`) archivierter Projekte ein (Lesen für alle aktiven Nutzer). Dazu Rechte-Tests ergänzen („Mitarbeiter darf archiviertes Projekt lesen, aber nicht ändern, aktives fremdes Projekt weiterhin nicht“).

### Phase 4 – Angebote
- Editor mit Blöcken Titel/Position/Text/Bild, Positionsnummern wie 01.0010, Zwischensummen, Übertrag pro Seite
- Positionen aus dem Katalog, Mengen aus dem Aufmaß. Netto, 19 % USt., Brutto, Rabatt
- Anfangs-/Schlusstexte als Vorlagen. PDF mit Briefpapier (Firmendaten nur aus Einstellungen)
- Status Entwurf/Versendet/Angenommen/Abgelehnt, Versand per E-Mail. Angebot → Auftrag → „Rechnung erstellen“ (Phase 5)
- **Wunsch (Mika): Eigene KI für Angebote**, in die man hineinreden oder -schreiben kann (wie bei Plancraft). **Reihenfolge:** erst Angebotseditor und Rechner ordentlich bauen, dann den KI-Assistenten dazufügen, damit er auf fertigen Bausteinen aufsetzt (Katalog, Aufmaß, Positionsnummern). Die KI macht nur **Vorschläge** (Entwurf), Ralf/Büro prüft und speichert; ohne Bestätigung wird nie etwas gespeichert (wie bei der Einteilung). **Kosten:** Eine echte KI (z. B. Claude über die API) kostet pro Nutzung Geld und passt nicht zur Regel „nur kostenlose Dienste“. Erst nach Ralfs Entscheidung einbauen, vorher nur austauschbar vorbereiten (Schnittstelle wie bei der Namen-Erkennung in `src/lib/einteilung-erkennung.ts`). Mitarbeiter-/Kundendaten nur an Anbieter mit Vertrag zur Auftragsverarbeitung und ohne Training mit den Daten schicken.

### Phase 5 – Rechnungen über die Lexware Office API
- **Zuerst die aktuelle Doku lesen** (developers.lexware.io) und Mika berichten. Rate-Limit beachten (Retry/Backoff)
- Kontakte synchronisieren, Rechnung erstellen → Lexware vergibt Nummer und PDF, wir speichern nur Spiegel-Daten
- Rechnungsliste per Sync. Abschläge prüfen; falls nicht per API möglich: Button „in Lexware öffnen“, nichts nachbauen
- Mahnungen, Eingangsrechnungen, Buchhaltung und DATEV bleiben in Lexware. API-Key nur serverseitig, nur der Admin pflegt ihn

### Phase 6 – Später (nicht jetzt bauen)
Dashboard für Ralf, Berichte/Bautagebuch als PDF, Push-Benachrichtigungen, Feedback-Button „Mir fehlt was“.

**Idee „Jarvis“ (Wunsch von Mika, später):** ein Sprachassistent mit eigener API. Ralf kann anrufen bzw. mit ihm sprechen und z. B. die Einteilung am Telefon machen („Sebastian und Jan mit Sprinter 1 zu Gerdes“). Dafür braucht es eine echte KI (z. B. Claude), Telefonie und eine API-Schnittstelle zur App. Die Namen-Erkennung aus Phase 1 soll dann durch die KI ersetzt werden können.

## Einstellungen (Admin)
Firmendaten, Logo/Briefpapier, Nummernkreise (nur Angebote/Projekte, Rechnungen nummeriert Lexware), Zahlungsziel, Anfangs-/Schlusstexte, E-Mail-Vorlagen, Fahrzeuge, Mitarbeiter + Rollen, Arbeitszeitmodelle, Feiertage (Niedersachsen), Projektstatus.

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
  - `buero/`: `/buero` (Hinweise, Material-Meldungen), `/buero/plantafel`, `/projekte`, `/kontakte`, `/zeiten`, `/urlaub`. Sidebar (am Handy ausklappbares Menü), nur Admin/Büro.
  - `buero/einstellungen/`: nur Admin (eigenes Layout mit `requireRole(["admin"])`), darunter `benutzer/` (Liste), `benutzer/neu`, `benutzer/[id]`, `zeiterfassung/`.
- `src/proxy.ts`: Session-Erneuerung + Login-Pflicht (in Next 16 statt `middleware.ts`)
- `src/lib/auth.ts`: `ladeSitzung()`, `requireUser()`, `requireRole()` (server-only). `src/lib/auth-aktionen.ts`: `abmelden()`
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
- `tests/rls/`: `00` Login-Adresse, `01` Funktionsrechte, `02` Rollen & Sperren, `03` Projekte/Kunden/Mitglieder/Fahrzeuge/Status/Löschen/ohne Login, `04` Phase 1 (Kollegen hinzufügen, Einteilung, Zeiten + Sperrfrist + mehrere auf einmal/erneut senden, Einstellungen, Urlaub, Notizen/Material/Aufmaß inkl. Freischalten + Abhaken, Fotos-Storage). Stopps (mehrere Baustellen pro Auto, Zeit, automatische Mitgliedschaft) und Termine (Rechte, Hinweis) sind in `04` getestet. Insgesamt 84 Tests. Einzelne Datei: `npx vitest run --config vitest.rls.config.mts tests/rls/04-…` (spart Logins)
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
- **Urlaub:** Feiertage Niedersachsen werden noch nicht von den Werktagen abgezogen und nicht gebucht (kommt mit den Einstellungen „Feiertage“). Die übrigen Mitarbeiter (außer Christian 30, Sebastian/Carmen/Manuel 28) haben noch keinen Anspruch eingetragen – Mika/Ralf tragen ihn in der Nutzerverwaltung ein, sobald die echten Nutzer angelegt sind.
- Format der Projekt- und Kundennummern sowie Exportformat aus Plancraft (Phase 3)
- Arbeitszeitmodelle und Überstundenregeln (Phase 3)
- Firmenlogo und Farben
- Abschlags-/Schlussrechnungen: klären mit dem Steuerberater (Phase 5)
