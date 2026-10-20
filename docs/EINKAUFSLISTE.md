# Einkaufsliste und Anleitungen (Stand 20.10.2026)

Für das Gespräch mit Ralf am Samstag, 24.10.2026. Bis dahin ist alles **kostenlos** (Vercel Hobby, Supabase Free, sevdesk nur mit Schein-Server).
**Wichtig:** Die Preise stammen aus Vergleichsseiten und Suchergebnissen, nicht von den Preisseiten der Anbieter. **Vor dem Kauf auf der Preisseite des Anbieters prüfen.** Alle Beträge ohne Umsatzsteuer, Dollar-Preise schwanken mit dem Kurs.

## 1. Was muss gekauft werden, bevor echte Daten rein dürfen?

| Dienst | Wofür | Preis (ca.) | Pflicht? |
|---|---|---|---|
| **Vercel Pro** | Hosting der App. Hobby ist laut Vercel nur für nicht-kommerzielle Nutzung erlaubt. | 20 $ pro Monat und Person, die deployed (1 Platz reicht: Mika). Mitarbeiter, die nur die App benutzen, brauchen keinen Platz. Enthält 20 $ Nutzungsguthaben. | **Ja** |
| **Supabase Pro** | Datenbank, Login, Fotos. Bringt **tägliche Backups** (7 Tage aufbewahrt). | 25 $ pro Monat und Organisation, enthält 10 $ Rechenguthaben je Projekt. Genauer Preis für `brinkmann-live` plus `brinkmann-dev` vorher prüfen. | **Ja** |
| **sevdesk Buchhaltung Pro** | Rechnungsnummer, Rechnungs-PDF/E-Rechnung, Buchhaltung im Hintergrund. **Pro** wird gebraucht, weil nur dort die REST-API enthalten ist. | Listenpreis 34,90 € pro Monat (monatlich zahlbar), 30,90 € bei 12 Monaten, 27,90 € bei 24 Monaten. Zusätzliche Nutzer 5,90 €. Oft Rabattaktionen (z. B. Black Friday). | **Ja**, wenn sevdesk statt Lexware benutzt wird |
| **Lexware Office** | Läuft bisher. Nur nötig, wenn die App weiter über Lexware abrechnet oder alte Rechnungen dort bleiben. | Bestehendes Abo, Preis in Ralfs Vertrag nachsehen. | Nein, wenn sevdesk übernimmt |

**Laufende Kosten ohne Jarvis:** ca. 45 $ (Vercel + Supabase) plus sevdesk (ca. 28–35 € pro Monat), also grob **75–80 € pro Monat**. Dafür entfällt ein Teil von Plancraft, sobald Ralf es kündigt.

## 2. Später, noch nicht kalkulierbar

- **Jarvis** (Sprachassistent, Telefon): braucht einen KI-Zugang (Abrechnung pro Nutzung), einen Telefondienst mit Rufnummer und Sprachdienste. Die Kosten hängen davon ab, wie oft er benutzt wird. Erst nach Ralfs Entscheidung, vorher eine Kostenschätzung machen.
- **KI beim Angebot:** wie Jarvis, Abrechnung pro Nutzung. Im Angebot ist bisher nur ein Platzhalter.
- **Briefpapier/Design:** keine laufenden Kosten.
- **Eigene Domain für die App** (statt `…vercel.app`): wenige Euro pro Jahr, Firmendomain `maler-brinkmann.de` gibt es schon.

## 3. Reihenfolge und Anleitung

### 3.1 Vor dem ersten echten Arbeitstag (Pflicht)
1. **Vercel auf Pro stellen.** vercel.com → Team „maler“ → Settings → Billing → Upgrade to Pro. Nichts anderes ändert sich, die Variablen und die Adresse bleiben.
2. **Supabase auf Pro stellen** (für `brinkmann-live`). supabase.com → Organisation → Billing → Upgrade. Danach unter Database → Backups prüfen, dass tägliche Sicherungen erscheinen.
3. **AVV/DPA abschließen** (Vertrag zur Auftragsverarbeitung) mit Supabase und Vercel. Beide bieten das im Dashboard bzw. auf der Rechtsseite zum Unterschreiben an. Ohne AVV dürfen keine Mitarbeiter- und Kundendaten in die Dienste.
4. **Zusätzlicher Datenbank-Export** und eine **Wiederherstellungs-Anleitung** (noch nicht gebaut, siehe `docs/SETUP.md`, Abschnitt 9).
5. Erst dann echte Zeiten, Fotos und Kunden eintragen. Das Datenschutz-Gespräch mit Ralf gehört auch dazu (Mitarbeiterdaten).

### 3.2 sevdesk einrichten
1. Tarif **Buchhaltung Pro** buchen und das **Buchführungssystem 2.0** nutzen (Voraussetzung für die API).
2. In sevdesk unter **Einstellungen → Benutzer** den **API-Token** erzeugen (32 Zeichen). Den Token niemals in den Chat, in Dateien im Projekt oder ins Frontend schreiben.
3. In sevdesk die **Firmendaten, Bankverbindung (IBAN/BIC) und Steuernummer** vollständig eintragen (für XRechnung nötig).
4. Token bei Vercel als Umgebungsvariable `SEVDESK_API_TOKEN` setzen, **nur für Production**, und zunächst `SEVDESK_MODUS=entwurf`. Dann legt die App Rechnungen in sevdesk nur als **Entwurf** an.
5. Eine Test-Rechnung aus der App erzeugen und in sevdesk prüfen: Nummer, Beträge, Steuer (19 %, bei Reverse-Charge 13b), PDF/E-Rechnung, Zahlungsziel.
6. Erst wenn alles stimmt: `SEVDESK_MODUS` entfernen. **Dann wird sofort finalisiert und die Rechnungsnummer vergeben, das ist nicht rücknehmbar.**
7. Die Annahmen aus der OpenAPI-Datei sind noch nicht mit einem echten Konto bestätigt (siehe CLAUDE.md, Phase 5). Beim ersten Test beobachten.
8. Ablauf der Abrechnung mit dem **Steuerberater** klären (E-Rechnungspflicht ab 2028, Abschlagsrechnungen).

### 3.3 Plancraft ablösen
1. Die Mitarbeiter-App läuft zunächst parallel zu Plancraft.
2. Wenn Ralf zustimmt: Kontakte-Import (CSV) und Katalog-Import sind vorbereitet (`import-dateien/`).
3. Plancraft erst kündigen, wenn alle Funktionen, die gebraucht werden, laufen und die Daten gesichert sind.

## 4. Quellen für die Preise (Stand der Suche, vor dem Kauf prüfen)
- sevdesk: [Erfahrungen und Kosten 2026](https://selbststaendigkeit.de/buchhaltung-fuer-gruender/sevdesk-erfahrungen), [Kostenübersicht](https://finom.co/de-de/blog/sevdesk-kosten/)
- Supabase: [offizielle Preisseite](https://supabase.com/pricing)
- Vercel: [Kostenübersicht 2026](https://makerkit.dev/blog/saas/vercel-cost)
