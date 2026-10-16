-- =============================================================================
-- Überstundenabbau (Abfeiern): neue Zeit-Art
--
-- Teil 1 von 2. Postgres erlaubt es nicht, einen neuen Aufzählungswert in
-- derselben Transaktion zu benutzen, in der er angelegt wurde. Darum steht nur
-- das Anlegen hier; Prüfregel, Funktionen und Buchung folgen in der nächsten
-- Migration (…230000).
-- =============================================================================

alter type public.zeit_art add value if not exists 'ueberstundenabbau';
