# Übergabe an einen neuen Chat (Stand 21.10.2026, vormittags)

**Text zum Einfügen in den neuen Chat:**

> Du arbeitest weiter an meiner Handwerker-Software für den Malerbetrieb meines Vaters (Ralf Brinkmann, Saterland). Lies zuerst **CLAUDE.md** (Regeln, Datenmodell, Entscheidungen, Befehle) und **docs/UEBERGABE.md** (diese Datei), bei Bedarf **docs/API.md**, **docs/VORSTELLUNG.md**, **docs/JARVIS-PROMPT.md**, **docs/EINKAUFSLISTE.md**, **docs/SETUP.md**. Arbeite auf Experten-Niveau (gründlich, sicherheitsbewusst, getestet), erkläre mir als Anfänger aber kurz auf Deutsch, was du tust und warum. **Alle Rückfragen nur über das Auswahl-Menü (AskUserQuestion, Empfehlung zuerst), nie als offene Frage im Text.** **Vor jedem Push zeige mir die Änderung auf localhost** (ich melde mich selbst an, du gibst nie mein Passwort ein) und warte auf mein OK; Migration erst nach live, dann pushen. Nur eigene Dateien mit explizitem `git add` committen. **Frist: Samstag 24.10.2026 stelle ich alles Papa vor.** Nächste Aufgabe: siehe „Sofort als Nächstes“ in der Übergabe.

## Projekt in Kürze
- Eigene Software statt Plancraft, **Prototyp** (Ralf entscheidet nach der Vorstellung, erst dann wird gekauft). Stack: Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui (Base UI), Supabase (dev `akbqdpwajeaynwqczfkg`, live `tezveryzixrysviapmal`), Vercel Hobby, Vitest.
- Live: https://maler-brinkmann-23nr.vercel.app (Push auf `main` = Deployment, 2–3 Min). Migrationen: `npx supabase link --project-ref tezveryzixrysviapmal` → `db push --dry-run` → `db push` → **wieder** `link --project-ref akbqdpwajeaynwqczfkg`.
- Echte Konten existieren in dev und live. Tests/Browser nur mit Wegwerf-Nutzern (`test-…`), nie Mikas Konten ändern. Aufräumen der Wegwerf-Nutzer: vorher `created_by`/`bearbeitet_von` an contacts, projects, quotes, invoices, quote_shares auf null setzen, Zeiten löschen, sonst scheitert `testNutzerLoeschen`.
- Arbeitsweise im Browser: Dev-Server per `preview_start` (Name `dev`), eigener Cookie-Bereich `http://test.localhost:3000` (Wegwerf-Nutzer) bzw. `test2.localhost`; Mikas echte Sitzung läuft auf `localhost`. Skripte mit dem Write-Werkzeug schreiben (Heredocs mit Sonderzeichen brechen), mit `npx tsx --env-file=.env.local scripts/_tmp-….ts` ausführen und danach löschen. Zugangsdaten nie ausgeben.

## Stand: alles gepusht (letzter Commit `8eec72e`), Datenbank in dev und live auf dem gleichen Stand
Heute/gestern gebaut und live: Mitarbeiter-Filter bei den Einsätzen, Chat-Reiter (Nachrichten/Erwähnungen/Galerie), **Rechte pro Rolle einstellbar** (Einstellungen → Rollen & Zugriffsrechte, 295 Rechte-Tests), KI-Auslesen für Eingangsrechnungen **vorbereitet und AUS** (Migration `…200000_eingangsrechnung_ki` auch in live), Vorstellung (`docs/VORSTELLUNG.md`), Jarvis-Prompt (`docs/JARVIS-PROMPT.md`), Einkaufsliste mit Preisen (`docs/EINKAUFSLISTE.md`), **Anfangs-/Schlusstext für Rechnungen** (Einstellungen → Rechnungen – Vorgaben, gehen an die Buchhaltung). Graphify ist global installiert (`graphify-out/` nicht im Repo).

## Umgebungen und Schlüssel (nur Namen, nie Werte)
- **Vercel Production** hat gesetzt: Supabase-Variablen, `LOGIN_EMAIL_DOMAIN`, `LEXWARE_API_KEY`, `LEXWARE_MODUS`, `SMTP_*` (Strato, `SMTP_FROM` = „Maler Brinkmann <Adresse>“), `IMAP_*`, `CRON_SECRET`, `SEVDESK_API_TOKEN`, `SEVDESK_MODUS=entwurf`. Änderung per `npx vercel@latest env add NAME production --force --yes` (Wert per stdin) und danach `npx vercel@latest redeploy <letzte-Production-URL>`.
- **Lokal `.env.local`:** gleiche Namen, `SEVDESK_MODUS=entwurf` (sicher). `BUCHHALTUNG_ANBIETER` ist nicht gesetzt: Mit Token nimmt die App sevdesk, sonst Lexware.
- E-Mail-Versand (Strato, Port 465) ist mit dem echten Postfach bestätigt (Test-Mail und Angebots-Mail kamen an). Der **IMAP-Abruf für Eingangsrechnungen ist noch nie mit echten Mails gelaufen** (Probelauf mit 1–2 Mails; vorher alte ungelesene Mails als gelesen markieren, sonst werden sie importiert).

## Sofort als Nächstes (Mikas Entscheidung vom 21.10.2026): **bei Lexware bleiben, nicht sevdesk**
Grund: Lexware-Konto ist schon da und bezahlt, der Verbindungstest mit dem echten Konto klappt, kein zusätzlicher Tarif. sevdesk bleibt als Reserve im Code. Mika will:
1. **App wieder auf Lexware als Standard schalten:** `BUCHHALTUNG_ANBIETER=lexware` (lokal und bei Vercel) oder den `SEVDESK_API_TOKEN` bei Vercel entfernen. `LEXWARE_MODUS=entwurf` lassen, bis geprüft ist. Lexware zuerst im **Entwurf-Modus mit dem echten Konto** prüfen (Demo-Angebot → Rechnungsentwurf → übertragen, in Lexware nachsehen).
2. **Die Rechnung soll automatisch aus Lexware zurückkommen und in der App als Dokument (PDF) direkt sichtbar sein** (eingebettete Ansicht, immer, ohne Herunterladen, wie bei Plancraft; Mika: „wenn du nicht weißt, wie das aussieht, sag Bescheid, dann mache ich ein Screen Recording“). **Frage das als Erstes per Auswahl-Menü nach**, ob er ein Screen Recording von Plancraft schicken möchte. Stand der App: Nach dem Fertigstellen holt `rechnungUebertragen` die Datei und speichert sie im Bucket `rechnungen` (`invoices.pdf_pfad`); die Rechnungsseite hat Ansehen/Herunterladen, aber keine eingebettete Ansicht und der Abgleich ist ein Knopf. Zu bauen: eingebettete PDF-Ansicht auf `/buero/rechnungen/[id]`, Datei beim Fertigstellen automatisch holen, Abgleich automatisch beim Öffnen (und evtl. täglich). **Grenze:** Lexware erzeugt Dateien nur für fertiggestellte Rechnungen (Entwürfe haben keine Datei). Die **harte Regel** (nie eigene Rechnungsnummer/-PDF) bleibt: Eine App-eigene „Vorschau“ nur klar als Entwurf gekennzeichnet und nie mit Nummer, vorher mit Mika abstimmen.
3. Das **Sperren nach dem Fertigstellen** gibt es schon (Trigger, nie wieder Entwurf). Mika fragte, warum das nicht „wie bei Plancraft“ sei: erklärt (Rechnungsnummer/PDF/E-Rechnung/GoBD macht bewusst das Buchhaltungsprogramm). Eigene Rechnungserzeugung nur nach Rücksprache mit dem Steuerberater, nicht vor Samstag.

## Stand 21.10.2026, nachmittags (noch nicht gepusht, wartet auf Mikas OK nach dem Ansehen auf localhost)
- Gebaut: Lexware wieder Standard (Code, keine Vercel-Änderung nötig), PDF-Vollbild-Fenster + eingebettete PDF-Ansicht, automatischer Abgleich beim Öffnen (Details in CLAUDE.md, Phase 5). Unit-Tests 660 grün, Typen und Lint sauber, im Browser mit Demo-Rechnung geprüft (Demo-Daten sind weggeräumt/archiviert).
- Als Nächstes: Mika schaut es auf localhost an (Liste → Auge, Rechnungsseite), dann Push. Danach der erste echte Lexware-Test im Entwurf-Modus (`LEXWARE_MODUS=entwurf`). Vorsicht: Die Entwurf-Rechnung hat in Lexware noch keine Datei; die PDF-Ansicht erscheint erst nach dem Fertigstellen dort und einem Abgleich.

## Nachtrag 21.10.2026 abends (noch NICHT gepusht)
- Lokal committet: Lexware-Standard + PDF-Fenster + Zeilenmenü + Sammel-Download, **Nachkalkulation** (`docs/NACHKALKULATION.md`), **Editor** (Aus Dokument, Preis anpassen, Titel einklappen), **Dokumentarten**, **KI-System**-Seite.
- **Vor dem Push zwei Migrationen nach live:** `…20261021150000_nachkalkulation` und `…20261021160000_dokumentarten` (beide sind in dev). Ablauf: `npx supabase link --project-ref tezveryzixrysviapmal` → `db push --dry-run` → `db push` → wieder `link --project-ref akbqdpwajeaynwqczfkg`. Der Code braucht die neuen Spalten, sonst bricht die Online-Version ab.
- Mika wollte alles vorher auf localhost sehen. Plancraft-Vergleich: `plancraft-feature-analyse.md` (Downloads) ist abgearbeitet bis auf: Ziehen zum Sortieren, mehrere Titel-Ebenen, Zeiten ins Dokument (Regie), Anhänge-Dialog, Abschlagsrechnungen, Gutschrift.

## Offen und wichtig für Samstag (Vorstellung am 24.10.2026)
- Einmal selbst online einloggen und durchspielen (`docs/VORSTELLUNG.md`).
- Rechnungen sind mit keinem Buchhaltungsprogramm **echt fertiggestellt** getestet (nur Entwurf). Vor echter Nutzung: Firmendaten/IBAN/Steuernummer im Programm, Steuerberater (E-Rechnung ab 2028, Abschläge).
- **Aufräumen bei sevdesk:** Zwei Demo-Entwürfe (RE-1000, RE-1001, „Holzfassade lasieren“) und der Demo-Kunde „Petra und Jörg Wichmann“ (D-1018) liegen in Mikas sevdesk. Dort löschen, **nicht im sevdesk-Editor speichern** (der zeigt per Schnittstelle angelegte Entwürfe leer an und würde sie überschreiben).
- sevdesk-PDF ist englisch (Konto-Sprache), Absenderblock zeigt nur die E-Mail (Firmendaten in sevdesk fehlen). Entfällt bei Lexware, dort entsprechend Firmendaten/Layout prüfen.
- Noch nicht gebaut: Jarvis selbst (Telefon, Büro-Konto-Bindung der API, Containerfirma als Einstellung), KI bei Angeboten, Push-Benachrichtigungen, Abschlagsrechnungen, Mitarbeiter-App am iPhone getestet (nur Installation/Update-Hinweis).
- Kosten laut `docs/EINKAUFSLISTE.md`: Vercel Pro ca. 20 $, Supabase Pro ca. 25 $ pro Monat (vor echten Daten Pflicht, Backups), sevdesk entfällt bei Lexware.

## Wichtige Entscheidungen (Mika)
- Rückfragen nur per Auswahl-Menü. Vor jedem Push localhost zeigen. Nur Gratis-Dienste bis Ralf entscheidet (Kostenhinweis immer).
- Rechnungen: Nummer und Datei nur vom Buchhaltungsprogramm, alles bedienen in der App, kein Öffnen der Fremdseite. Jarvis darf Entwürfe schreiben, aber nichts abschicken.
- Angebote gehen mit Link/Online-Ansicht raus (Mika sieht, ob geöffnet wurde). Container-Sperre dürfen Büro und Admin aufheben. Abfeiern genehmigt der Admin (jetzt als Recht an Büro verleihbar).
- Mitarbeiter sehen im Einsätze-Filter nur sich und das Team im selben Auto; „Neuer Einsatz“ per Plus nur für Büro/Admin; Chat ohne Hinweis bei @.

## Stolperfallen
- Übertragene Rechnungen sind per Trigger gesperrt: Tests/Aufräumen archivieren statt löschen (`created_by` auf null), `sevdesk_id` ist unique.
- `invoices.lexware_status` ist der bereinigte Status beider Anbieter (draft/open/paid/voided).
- Neue Rechte = Katalog `src/lib/rechte.ts` + CHECK in neuer Migration + Regeln + Prüfung im Code; Test `src/lib/rechte.test.ts` vergleicht Katalog und Migration.
- Verknüpfung der Supabase-CLI nach jedem Live-Push wieder auf dev setzen (`supabase/.temp/project-ref` prüfen).
- Bei Windows: PowerShell-Skripte gesperrt → `npm.cmd`/`npx.cmd` im Terminal von Mika; Vercel-Befehle laufen mit `npx vercel@latest …`.
