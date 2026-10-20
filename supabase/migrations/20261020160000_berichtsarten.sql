-- Berichtsarten wie in der Plancraft-Mitarbeiter-App (Mika, 20.10.2026): zusätzlich zum Bautagesbericht jetzt
-- Abnahmeprotokoll, Aufmaß, Baustellenbegehung, Bedenkenanzeige, Besprechungsprotokoll, Checkliste, Einsatzbericht und Regiebericht.
-- Der Inhalt liegt weiter als JSON in `daten` (die App prüft ihn, Aufbau je Art in src/lib/bericht-arten.ts).
-- Hier wird nur die erlaubte Liste der Arten erweitert; alle Rechte und Schutzregeln bleiben unverändert.

alter table public.project_reports drop constraint project_reports_art_check;
alter table public.project_reports add constraint project_reports_art_check check (art in (
  'abnahmeprotokoll', 'aufmass', 'baustellenbegehung', 'bautagesbericht', 'bedenkenanzeige',
  'besprechungsprotokoll', 'checkliste', 'einsatzbericht', 'regiebericht'
));
