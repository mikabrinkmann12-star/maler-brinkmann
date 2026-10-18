# Nacht vom 18.10.2026: was gebaut wurde, was ich entschieden habe, was du testen sollst

Alles ist in `main` und online (Vercel „Ready“). Die neue Datenbank-Tabelle (Eingangsrechnungen) ist in **dev und live**.
Genaue Beschreibungen stehen in `CLAUDE.md` (Phase 3).

## Gebaut (in dieser Reihenfolge)
1. **Einstellungen wie Plancraft** (Menü links in Gruppen, Feiertage, Rollen & Zugriffsrechte, Projektstatus, Lohngruppen, Einheiten) – bereits vor der Nacht fertig, hier nur committet.
2. **Eingangsrechnungen** (`/buero/eingangsrechnungen`, Menü „Eingangsrechnungen“; die bisherigen „Rechnungen“ heißen im Menü jetzt „Ausgangsrechnungen“).
3. **Projektseite fürs Büro** (`/buero/projekte/[id]`).
4. **Angebots-Editor** in zwei Spalten (Summen und Aktionen rechts).
5. **„Neue Zeit“ als Fenster**.
6. **Rechnungs-Einstellungen** (Einstellungen → Buchhaltung → „Rechnungen – Vorgaben“).

## Meine Entscheidungen (du änderst sie, wenn du es anders willst)
- **Eingangsrechnungen automatisch auslesen, aber ohne KI und ohne OCR** (kostet nichts, keine Daten an Fremde): E-Rechnung (XML/ZUGFeRD) wird verlässlich gelesen und gilt gleich als geprüft; normale PDFs mit Text werden über Beschriftungen gelesen und bleiben „Zu prüfen“; Fotos/Scans ohne Text muss man von Hand eintragen. Plancraft nutzt dafür KI-Scans (50 im Monat).
- **Kostenzuweisung**: ein Projekt **oder** ein Bereich (Lager/Büro/Mitarbeiter), nicht mehrere Ziele je Rechnung.
- **E-Mail-Eingang** (Postfach per IMAP): gebaut, aber **nicht mit einem echten Postfach getestet**. Er braucht Umgebungsvariablen (`IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD`, `CRON_SECRET`, siehe `.env.example` und Einstellungen → „Postfach für Rechnungen“). Der tägliche Abruf läuft einmal am Tag (Vercel Hobby erlaubt nicht öfter), dazu gibt es den Knopf „Postfach abrufen“.
- **Projektseite, Angebots-Editor, „Neue Zeit“-Fenster**: In deinen Aufnahmen sind diese drei Seiten von Plancraft **nicht zu sehen**. Ich habe sie nach dem gebaut, was ich von Plancraft kenne, und vorhandene Bausteine wiederverwendet. Sie sind also **nicht 1:1**. Wenn du genau diesen Aufbau willst, brauche ich eine Aufnahme dieser Seiten.
- **Zahlungsziel der Firma**: bleibt leer, bis du es einträgst (Plancraft hat 7 Tage). So ändert sich für bestehende Abläufe nichts.

## Bitte morgen testen
1. Eingangsrechnungen: mehrere echte PDFs von Lieferanten hochladen (auch gleichzeitig) und prüfen, ob Lieferant, Nummer, Datum, Beträge richtig erkannt werden. **Das ist der wichtigste Test**, weil ich nur mit selbst erzeugten Beispielen getestet habe. Was falsch erkannt wird, gib mir (Lieferant + was falsch war), dann verbessere ich die Erkennung.
2. Projektseite: ein Projekt mit Angeboten, Rechnungen und Zeiten öffnen (Kacheln, Status ändern, Kollegen hinzufügen).
3. „Neue Zeit“: Plus im Menü bei „Zeiten“, Knopf auf der Zeiten-Seite und Strg+K → „Zeit erstellen“.
4. Einstellungen → „Rechnungen – Vorgaben“: Zahlungsziel eintragen, danach ein neues Angebot anlegen (Zahlungsbedingungen sind vorbelegt).

## Nicht gemacht
- Suchfenster-Reiter „Eingangsrechnungen“, Ablage mit Ordnern, Aktivitätsverlauf in der Projektseite, OCR für Fotos.
- Der E-Mail-Abruf des Rechnungs-Postfachs wurde nicht mit einem echten Postfach ausprobiert.
