# Eigenes Backup (bis Supabase Pro gebucht ist)

Supabase Free macht für `brinkmann-live` **keine** Sicherungen. Bis Supabase Pro gebucht ist, sichert dieses Skript alles auf deinen PC.
Es kostet nichts und **liest nur**, es ändert an der Datenbank nichts.

## Was gesichert wird
- alle Tabellen als JSON (Kontakte, Projekte, Zeiten, Angebote, Rechnungen, Einstellungen …)
- die Nutzerliste (ohne Passwörter, die gibt Supabase nicht heraus)
- alle Dateien: Fotos, Rechnungs-PDFs, Angebotsbilder, Logo, Eingangsrechnungen …

Ziel: `C:\Users\mikab\Desktop\APP-Backups\<Projekt>\<Datum_Uhrzeit>\` (anders: `BACKUP_ORDNER=…` in `.env.live`).
Es bleiben die **letzten 12 Sicherungen**, ältere löscht das Skript selbst. Live hat die Kennung `tezveryzixrysviapmal`, dev `akbqdpwajeaynwqczfkg`.

## Sichern (von Hand)
Im Terminal im Projektordner:
```
npm.cmd run backup
```
Dauert je nach Fotos ein paar Minuten. Für dev: `npm.cmd run backup -- .env.local`.

**Wichtig:** Der Ordner liegt nur auf diesem PC. Kopiere ihn ab und zu zusätzlich woandershin (USB-Stick, iCloud/OneDrive), sonst ist bei einem PC-Schaden beides weg.

## Automatisch jede Woche (Windows-Aufgabenplanung)
Einmal in **PowerShell** (normal, nicht als Admin) einfügen und Enter:
```
schtasks /Create /SC WEEKLY /D MO /ST 09:00 /TN "Maler Brinkmann Backup" /TR "cmd /c cd /d C:\Users\mikab\Desktop\APP && npm.cmd run backup >> C:\Users\mikab\Desktop\APP-Backups\backup.log 2>&1"
```
Dann läuft es jeden Montag um 9 Uhr, wenn der PC an ist. Ist er aus, holt Windows es nicht automatisch nach – dann einfach von Hand starten.
- Prüfen: Start → „Aufgabenplanung“ → „Aufgabenplanungsbibliothek“ → „Maler Brinkmann Backup“ → rechts „Ausführen“ zum Testen.
- Wieder entfernen: `schtasks /Delete /TN "Maler Brinkmann Backup" /F`
- Was passiert ist, steht in `C:\Users\mikab\Desktop\APP-Backups\backup.log`.

## Wiederherstellen
Fügt nur **fehlende** Zeilen und Dateien wieder ein, überschreibt nie etwas, das noch da ist (z. B. wenn Kontakte oder Fotos aus Versehen gelöscht wurden).

1. **Probelauf** (zählt nur, ändert nichts), Standard ist dev:
   ```
   npm.cmd run backup:zurueck -- "C:\Users\mikab\Desktop\APP-Backups\tezveryzixrysviapmal\2026-11-17_09-00-00" .env.live
   ```
2. Passt das, denselben Befehl mit `--ja` am Ende: dann wird wirklich eingefügt.

Grenzen:
- **Nutzer/Logins** stellt das Skript nicht her. Fehlt ein Nutzer, im Büro unter Einstellungen → Benutzer neu anlegen; seine Zeilen klappen danach.
- **Geänderte** Werte (z. B. ein überschriebener Preis) werden nicht zurückgesetzt, nur gelöschte Zeilen kommen zurück. Für einen kompletten Neuaufbau: Mika/Claude fragen.
- Fertige Rechnungen sind in der Datenbank gesperrt; sie werden ohnehin nicht gelöscht.

## Wenn Supabase Pro gebucht ist
Dann macht Supabase täglich eigene Sicherungen (7 Tage zurück) mit Wiederherstellen per Klick. Dieses Skript kann trotzdem weiterlaufen als zweite Kopie außerhalb von Supabase (empfohlen für die Aufbewahrungspflicht).

Getestet (11.11.2026, dev): Sicherung 48 Tabellen / 13.552 Zeilen / 13 Nutzer / alle Dateien; ein gelöschter Testkontakt kam mit `backup:zurueck … --ja` wieder.
