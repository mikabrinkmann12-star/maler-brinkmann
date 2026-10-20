# Übergabe an einen neuen Chat (Stand 20.10.2026, abends)

**Text zum Einfügen in den neuen Chat:**

> Du arbeitest weiter an meiner Handwerker-Software für den Malerbetrieb meines Vaters (Ralf Brinkmann, Saterland). Lies zuerst **CLAUDE.md** (Regeln, Datenmodell, Entscheidungen, Befehle), **docs/UEBERGABE.md** (diese Datei) und bei Bedarf **docs/API.md**, **docs/PLANCRAFT-MITARBEITER-APP.md**, **docs/SETUP.md**. Arbeite auf Experten-Niveau (gründlich, sicherheitsbewusst, getestet), erkläre mir als Anfänger aber kurz auf Deutsch, was du tust und warum. **Rückfragen zu Geschäftslogik immer über das Auswahl-Menü (AskUserQuestion, Empfehlung zuerst), nie raten.** Kleine Schritte, nach jedem: Tests, Commit (nur eigene Dateien mit explizitem `git add`, nie `git add -A`), Push, Zusammenfassung. **Frist: Samstag 24.10.2026 stelle ich alles Papa vor.** Nächster Schritt: siehe „Sofort als Nächstes“ in der Übergabe.

## Projekt in Kürze
- Eigene Software statt Plancraft, **Prototyp** (Ralf entscheidet nach der Vorstellung, erst dann wird gekauft). Nur Gratis-Dienste, außer mit Kostenhinweis. Stack: Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui (Base UI), Supabase (dev `akbqdpwajeaynwqczfkg`, live `tezveryzixrysviapmal`), Vercel Hobby, Vitest.
- Live: https://maler-brinkmann-23nr.vercel.app (Push auf `main` = Deployment). **Regel: Migration erst nach live, dann pushen** (Ablauf: `npx supabase link --project-ref tezveryzixrysviapmal` → `db push` → wieder `link --project-ref akbqdpwajeaynwqczfkg`).
- Echte Konten existieren in dev und live (siehe CLAUDE.md). Tests/Browser nur mit Wegwerf-Nutzern, nie Mikas Konten ändern.
- Es laufen **parallel zwei Sitzungen**: Hauptsitzung (Büro, Rechnungen, API) und „Mitarbeiter-App wie Plancraft“ (`(mitarbeiter)/**`, gemeinsame generierte Datei `database.types.ts`). Darum nur eigene Dateien committen. Der Browser-Pane und der Dev-Server (Port 3000) werden gemeinsam benutzt, Fast Refresh der anderen Sitzung setzt Seiten oft zurück: eigenen Tab nehmen, Klickfolgen in einem JS-Skript bündeln.

## Erledigt seit 18.10. (alles gepusht, Migrationen in dev UND live, außer sevdesk)
- Eingangsrechnungen (Auto-Auslesen ohne KI, IMAP-Abruf, Cron), Projekt-Detailseite, Angebots-Editor zweispaltig, „Neue Zeit“-Fenster, Rechnungs-Einstellungen (Zahlungsziel/Mahnstufen).
- Admin kann genehmigten Urlaub/Abfeiern auch während er läuft zurücknehmen („Rest ab heute“ oder ganz).
- Container-Knöpfe Papier/Restmüll (7 Tage Sperre pro Art für alle, Hinweis fürs Büro, Seite `/buero/container`).
- **API für Jarvis** (`/api/v1`, Schlüssel nur als Hash, lesen/schreiben getrennt, Entwürfe ja, Versenden/Löschen nein; `docs/API.md`). Jarvis selbst (Sprache, Telefon) ist **nicht gebaut** und braucht bezahlte Dienste.
- Ausgangsrechnung-Seite im Plancraft-Stil mit Notiz.
- **Angebot per E-Mail mit Link zur Online-Ansicht** (Plancraft-Stil, öffentliche Seite `/angebot/<Schlüssel>`, PDF ansehen/laden, Öffnung wird erfasst, Status „Geöffnet“, Hinweis beim ersten Öffnen). Commit a69c8c3, im Browser geprüft; **die Mail selbst nicht mit dem echten Postfach getestet**.
- Mitarbeiter-App (andere Sitzung, gepusht, letzter Commit 40a00d8): Rahmen mit vier Reitern, Einstellungen, Einsätze mit Wochenstreifen, Projekte mit Reitern, Zeiten + Stempeluhr, Kontakte, neun Berichtsarten. Offen dort: Chat in Plancraft-Optik, Mitarbeiter-Filter bei den Einsätzen, Test am iPhone.

## Sofort als Nächstes (Reihenfolge)
1. **sevdesk fertig machen** (Commit 378852a, **inzwischen gepusht, Migration `…170000` ist auch in live**, geprüft am 20.10.2026 abends; CLAUDE.md ist ergänzt; online gibt es noch keinen sevdesk-Token, dort läuft weiter Lexware): Mika wollte Lexware ersetzen, alles aus der App bedienen, sevdesk unsichtbar im Hintergrund. Offen ist nur noch der Browser-Blick und der Test mit einem echten Konto.
   - Gebaut: `src/lib/sevdesk-client.ts`, `sevdesk-rechnung.ts` (Payload nach OpenAPI, Steuerregel 1 / Reverse-Charge = 5), `sevdesk-uebertragung.ts` (übertragen, abgleichen, per Mail, bezahlt buchen, mahnen, stornieren), `buchhaltung.ts` (Anbieter-Wahl), `rechnung-mail.ts`, Rechnungsseite mit `buchhaltung-leiste.tsx`, `rechnung-aktionen.tsx`, `mahnung-karte.tsx`, Einstellungsseite `/buero/einstellungen/sevdesk`, Migration `20261020170000_sevdesk.sql` (**nur dev!**), Tests (Unit + `tests/rls/20-sevdesk.test.ts` gegen Schein-Server), `scripts/sevdesk-schein-server.ts` (Port 4010).
   - **Noch nicht im Browser angesehen:** die Rechnungsseite im Zustand „übertragen“ (Mailpanel, Zahlungskarte, Mahnkarte). Zum Testen `.env.local` temporär `SEVDESK_API_TOKEN=schein` und `SEVDESK_BASIS_URL=http://localhost:4010/api/v1` setzen, Schein-Server starten, danach Zeilen wieder entfernen. Die Dev-Test-Rechnung `7e6e349e-…` steht schon auf „übertragen“ (sevdesk_id 7770001); sie ist nicht löschbar, nur archivierbar.
   - **Nicht mit echtem Konto geprüft** (Annahmen aus der OpenAPI-Datei): Rechnungsnummer wird beim Versenden vergeben, `/SevUser` und `/Unity` existieren (nicht in der Spec), Datumsformat `TT.MM.JJJJ`, Steuerfelder, `buyerReference` am Kontakt, Mahnung ohne Gebühr (API erlaubt keine), XRechnung braucht IBAN/BIC/Steuernummer in sevdesk. Erst mit `SEVDESK_MODUS=entwurf` probieren. sevdesk braucht Tarif mit API (Buchhaltung Pro) und Buchführungssystem 2.0.
2. **Einkaufsliste/Anleitungen** schreiben (Lexware weg oder alt, sevdesk Buchhaltung Pro, Supabase Pro ≈ 25 $, Vercel Pro ≈ 20 $ pro Platz, später KI/Telefon für Jarvis). Gesamt bisher ≈ 45 $/Monat plus sevdesk-Tarif.
3. **Aufräumen in dev:** Test-Admin `test-4b3be950`, Container-Testmeldung, Test-Benachrichtigungen, archivierte `TEST-…`-Projekte/Kunden/Rechnungen (übertragene Rechnungen lassen sich nicht löschen).
4. Gesamtlauf: Dev-Server stoppen, `rm -rf .next`, `npx next typegen`, `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:rls` (nicht öfter als ~2× pro 5 Min), `npm run build`.
5. Später: Jarvis (nach Ralfs Entscheidung), Briefpapier, KI-Angebot, Abschlagsrechnungen (mit Steuerberater), Test der Mitarbeiter-App am iPhone.

## Wichtige Entscheidungen (Mika)
- Rechnungen: Nummer und Datei nur vom Buchhaltungssystem, nie von der App. Alles Bedienen in der App, kein Öffnen der Fremdseite. Jarvis darf Rechnungen schreiben (Entwurf), aber nicht abschicken.
- Angebote gehen aus der App raus mit Link/Online-Ansicht wie Plancraft; Mika sieht, ob geöffnet wurde.
- Container-Sperre aufheben dürfen Büro und Admin. Abfeiern: Admin entscheidet, kann auch Rest ab heute zurücknehmen.
- Nur API für Jarvis bis Samstag, kein Sprach-/Telefonteil.

## Stolperfallen
- Übertragene Rechnungen: Trigger sperren Löschen und Zurück auf Entwurf, Tests müssen sie archivieren statt löschen (`created_by` auf null setzen), sonst blockiert das Löschen der Test-Nutzer.
- `sevdesk_id` ist unique: Test-Schein-IDs zufällig wählen.
- `lexware_status` ist der bereinigte Status beider Anbieter (draft/open/paid/voided).
- Heredocs mit Sonderzeichen in Bash brechen leicht: Dateien mit dem Write-Werkzeug schreiben; Python im Git-Bash sieht keine `/c/…`-Pfade.
- Verknüpfung der Supabase-CLI nach jedem Live-Push wieder auf dev setzen (`supabase/.temp/project-ref` prüfen).
