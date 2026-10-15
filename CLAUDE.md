@AGENTS.md

# Maler Brinkmann – Handwerker-Software

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
- **`profiles.rolle` ist die einzige Quelle für die Rolle.** `app_metadata` wird nur einmalig beim Anlegen des Users gelesen (Trigger). Nie JWT-Claims oder `app_metadata` für Rechte nutzen. `requireRole()` liest Rolle, `aktiv` und `muss_passwort_aendern` bei jeder Anfrage frisch aus `profiles`.
- **RLS-Hilfsfunktionen** (`ist_admin()`, `ist_buero_oder_admin()`, `ist_projektmitglied()` …) sind `SECURITY DEFINER`, `STABLE`, mit `set search_path = ''` und voll qualifizierten Namen. Sie zählen nur aktive Nutzer. Rechte: `REVOKE EXECUTE … FROM PUBLIC, anon` und `GRANT EXECUTE … TO authenticated`.
- **Admin-Funktionen** (z. B. `nutzer_sessions_beenden()`): `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` und `GRANT EXECUTE … TO service_role`. Trigger-Funktionen: `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`.
- **Keine Secrets im Frontend oder Repo**, nur in Umgebungsvariablen. `.env*` steht in `.gitignore` (Ausnahme `.env.example`, immer ohne Werte). Der Supabase **Secret Key** wird nur in Dateien mit `import "server-only"` benutzt. Der **Publishable Key** darf ins Frontend, weil RLS die Daten schützt.
- **Nichts endgültig löschen** bei Projekten, Kontakten, Zeiten und Angeboten: archivieren (`archiviert_am`), keine DELETE-Policies dafür.
- Wichtige Tabellen bekommen den **Audit-Trigger** (`audit_log`: wer hat was wann geändert).
- **Oberfläche komplett auf Deutsch.** Datum `TT.MM.JJJJ`, Beträge `1.234,56 €`. Dafür immer `src/lib/format.ts` nutzen. Zeitzone `Europe/Berlin`.
- **Firmendaten** (Briefkopf, USt-ID, Steuernummer, Bank …) kommen nur aus den Einstellungen, nie hardcoden.
- **Testdaten (Seed) nur in `brinkmann-dev`**, nie in Live. Das Seed-Skript bricht ab, wenn nicht `APP_ENV=development` gesetzt ist.
- Mobile-first für Mitarbeiter: große Buttons (mind. 48 px), wenig Text, keine verschachtelten Menüs (Plancraft war den Mitarbeitern zu kompliziert).
- Formulare dürfen Eingaben nicht verlieren, wenn das Senden fehlschlägt: lokal zwischenspeichern und erneut senden. Ein Offline-Modus wird nicht gebaut.

## Tech-Stack
- **Next.js 16** (App Router, TypeScript, `src/`, Turbopack), React 19. Achtung: In Next 16 heißt `middleware.ts` jetzt `proxy.ts`. Vor neuem Next-Code die Doku in `node_modules/next/dist/docs/` lesen (siehe AGENTS.md).
- **Cache Components sind bewusst aus** (`next.config.ts`). Fast alle Seiten hängen vom eingeloggten Nutzer ab und werden pro Anfrage erzeugt, so bleibt der Code einfach.
- **Tailwind CSS 4** + **shadcn/ui** (Preset `base-nova`, also **Base UI** statt Radix: Komponenten nutzen die `render`-Prop statt `asChild`). Klassen werden mit `cn` aus dem Paket `cn` gemischt (offizielles shadcn-Paket).
- Für die Mitarbeiter-App gibt es die Button-Größen `size="touch"` (48 px) und `size="icon-touch"`.
- **Supabase**: Postgres, Auth und Storage, Region **Central EU (Frankfurt)**. Libraries `@supabase/supabase-js` + `@supabase/ssr`.
- Formulare: `react-hook-form` + `zod`. Toasts: `sonner`.
- Tests: **Vitest**
- **Hosting: Vercel**, Functions-Region `fra1`. Jeder Push auf `main` wird automatisch deployed.
- **PWA**: Manifest, Icons, schlanker Service Worker ohne Offline-Cache. Hinweis „Neue Version – neu laden“ über `/api/version`.

## Umgebungen
| | Supabase-Projekt | Vercel |
|---|---|---|
| Entwicklung | `brinkmann-dev` (Testdaten) | lokal + Preview-Deployments |
| Live | `brinkmann-live` (echte Daten, nie Seed) | Production (`main`) |

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
- Login mit **Benutzername + Passwort** (keine E-Mail nötig). Die interne Auth-E-Mail lautet `<benutzername>@<LOGIN_EMAIL_DOMAIN>` (Subdomain der Firmendomain, z. B. `login.<domain>`). An diese Adressen wird nie etwas geschickt.
- **Öffentliche Registrierung ist aus.** Nutzer legt nur der Admin an (Admin-API, `email_confirm: true`, `muss_passwort_aendern = true`).
- **Erster Login** → Pflicht-Passwortwechsel (mind. **10 Zeichen**, nicht das Startpasswort). Das Flag setzt erst der Server zurück, nachdem `auth.updateUser` erfolgreich war.
- Man bleibt **immer eingeloggt**, es gibt keinen „Eingeloggt bleiben“-Schalter.
- **Deaktivieren** = `profiles.aktiv = false` + Supabase-User bannen + `nutzer_sessions_beenden()`. **Aktivieren** = Bann aufheben + `aktiv = true`.
- Schutz: Ein Admin kann sich nicht selbst die Admin-Rolle nehmen oder sich deaktivieren, und es bleibt immer mindestens ein aktiver Admin.
- Passwort vergessen → Admin setzt ein neues (danach muss der Nutzer es wieder ändern).

## Datenmodell
Legende: ✅ angelegt · ⏳ kommt in der genannten Phase

- ⏳ (0.2) **profiles**: id (= auth.users.id), benutzername (unique), vorname, nachname, rolle, email (optional, Kontakt), telefon, aktiv, muss_passwort_aendern, arbeitszeitmodell
- ⏳ (0.2) **contacts**: Kunden/Firmen/Privat, kundennummer, Adresse, Ansprechpartner, Telefon, E-Mail, Notizen, lexware_contact_id, archiviert_am
- ⏳ (0.2) **projects**: name, projektnummer, Kunde, Baustellenadresse, Status, Zeitraum von/bis, Beschreibung, Ansprechpartner Büro, archiviert_am
- ⏳ (0.2) **project_statuses**: frei verwaltbar mit Farbe. Start: Entwurf, Angebot, Auftrag erteilt, In Arbeit, Rechnung angelegt, Rechnung geschrieben, Abgeschlossen, Anders vergeben, Abgelehnt von uns
- ⏳ (0.2) **project_members**: project_id, user_id, added_by, added_at
- ⏳ (0.2) **vehicles**: Name/Kennzeichen, aktiv
- ⏳ (0.2) **audit_log**: tabelle, datensatz_id, aktion, alt, neu, geändert_von, geändert_am
- ⏳ (1/2) **assignments** = Tageseinsatz: Datum, vehicle_id, project_id, Mitarbeiter[], Notiz
- ⏳ (1) **time_entries**: user, project, Datum, von, bis, Pause, Stunden, Art, Beschreibung, erstellt_von, zuletzt_bearbeitet. Arten: Arbeitszeit, Fahrtzeit, Urlaub, Unbezahlter Urlaub, Krank, Schlechtwetter, Kurzarbeit, Sonstiges
- ⏳ (1) **leave_requests**: Urlaubsanträge von, bis, Status offen/genehmigt/abgelehnt
- ⏳ (1) **project_notes**, **project_photos** (Supabase Storage, Vorher/Nachher/Mangel, mit Kommentar)
- ⏳ (1) **material_usage**: Projekt, Material, Menge, Einheit, gemeldet von
- ⏳ (1) **measurements** (Aufmaß): Projekt, Raum/Bereich, Position, Länge × Breite/Höhe, Abzüge (z. B. Fenster/Türen), Menge, Einheit
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
### Phase 0 – Grundgerüst (🔄 in Arbeit)
- [x] 0.1 CLAUDE.md, Git, Next.js + Tailwind + shadcn/ui, deutsche Formatierung
- [ ] 0.2 Supabase-Migration: Basistabellen + RLS + Audit, Test der Fake-Login-Adresse
- [ ] 0.3 Login (Benutzername), Pflicht-Passwortwechsel, Rollen, Layouts (Sidebar/Bottom-Nav, Umschalter)
- [ ] 0.4 Nutzerverwaltung (nur Admin) + Skript für den ersten Admin
- [ ] 0.5 PWA + Hinweis „Neue Version – neu laden“
- [ ] 0.6 Seed-Daten + RLS-Tests
- [ ] 0.7 Deployment (GitHub → Vercel → Supabase) + `docs/SETUP.md`

### Phase 1 – Mitarbeiter-App
- Startseite „Heute“: Auto, Baustelle, wer ist dabei, Adresse (Link zu Google Maps), Ansprechpartner, Notizen vom Büro
- Meine Baustellen (nur eigene) + Kollegen hinzufügen (Kernfeature)
- Zeit eintragen: Baustelle vorausgewählt, von–bis, Pause, Art, optional Beschreibung. Mehrere Baustellen pro Tag möglich, max. 3–4 Taps im Normalfall. Eigene Zeiten der letzten Tage bearbeitbar (Sperrfrist vom Admin einstellbar)
- Fotos & Notizen (Kamera direkt, Bilder vor dem Upload komprimieren), Material melden, Aufmaß, Urlaubsantrag

### Phase 2 – Plantafel (Einsatzplanung mit Autos)
- Tagesansicht: Karten pro Auto, Baustelle + Mitarbeiter per Drag & Drop, „wie gestern“ kopieren
- Wochen-/Monatsansicht: Zeilen pro Mitarbeiter und Projekt, Urlaub/Krank sichtbar
- Einteilung erscheint sofort in „Heute“. Wer zugeteilt wird, wird automatisch project_member

### Phase 3 – Büro-Grundlagen + Import aus Plancraft
- Kontakte, Projekte (Liste, Suche, Filter, Detailseite mit allem)
- Zeiten-Übersicht (Filter, Summen, Überstunden, Urlaub/Krank, CSV/Excel-Export für den Lohn)
- Stammdaten Materialien/Leistungen in Ordnern (EK + Zuschlag % → VK)
- Import-Tool (nur Admin): CSV/Excel mit Spalten-Zuordnung, Vorschau und Dubletten-Erkennung (Kontakte ~330, Projekte ~160, Materialien, Leistungen). **Vorher Mika nach dem Exportformat fragen.**
- DATANORM-Import (aktuell „Wilts 2025“, ca. 2.900 Artikel)

### Phase 4 – Angebote
- Editor mit Blöcken Titel/Position/Text/Bild, Positionsnummern wie 01.0010, Zwischensummen, Übertrag pro Seite
- Positionen aus dem Katalog, Mengen aus dem Aufmaß. Netto, 19 % USt., Brutto, Rabatt
- Anfangs-/Schlusstexte als Vorlagen. PDF mit Briefpapier (Firmendaten nur aus Einstellungen)
- Status Entwurf/Versendet/Angenommen/Abgelehnt, Versand per E-Mail. Angebot → Auftrag → „Rechnung erstellen“ (Phase 5)

### Phase 5 – Rechnungen über die Lexware Office API
- **Zuerst die aktuelle Doku lesen** (developers.lexware.io) und Mika berichten. Rate-Limit beachten (Retry/Backoff)
- Kontakte synchronisieren, Rechnung erstellen → Lexware vergibt Nummer und PDF, wir speichern nur Spiegel-Daten
- Rechnungsliste per Sync. Abschläge prüfen; falls nicht per API möglich: Button „in Lexware öffnen“, nichts nachbauen
- Mahnungen, Eingangsrechnungen, Buchhaltung und DATEV bleiben in Lexware. API-Key nur serverseitig, nur der Admin pflegt ihn

### Phase 6 – Später (nicht jetzt bauen)
Dashboard für Ralf, Berichte/Bautagebuch als PDF, Push-Benachrichtigungen, Feedback-Button „Mir fehlt was“.

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

## Projektstruktur (Kurzüberblick)
- `src/app/`: Seiten (App Router)
- `src/components/ui/`: shadcn/ui-Komponenten
- `src/lib/format.ts`: deutsche Formatierung (`formatDatum`, `formatDatumZeit`, `formatUhrzeit`, `formatBetrag`, `formatZahl`; leere Werte → „–“)
- `.env.example`: Vorlage der Umgebungsvariablen (ohne Werte)
- `.claude/launch.json`: Dev-Server für die Vorschau im Claude-Browser
- `supabase/migrations/`: Datenbank-Migrationen (ab 0.2)
- `docs/`: Anleitungen für Mika (ab 0.7)

## Go-Live-Checkliste (bevor Mitarbeiter mit echten Daten arbeiten)
- Vercel **Pro** (Hobby ist nur für nicht-kommerzielle Nutzung)
- Supabase **Pro** für `brinkmann-live` (tägliche Backups) + zusätzlicher Export + Restore-Anleitung
- AVV/DPA mit Supabase und Vercel abschließen

## Offene Fragen
- Domain-Name für `LOGIN_EMAIL_DOMAIN` (wird in 0.2 gebraucht)
- Sperrfrist für das Bearbeiten eigener Zeiten (Phase 1)
- Format der Projekt- und Kundennummern sowie Exportformat aus Plancraft (Phase 3)
- Arbeitszeitmodelle und Überstundenregeln (Phase 3)
- Firmenlogo und Farben
- Abschlags-/Schlussrechnungen: klären mit dem Steuerberater (Phase 5)
