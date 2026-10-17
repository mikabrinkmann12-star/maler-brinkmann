-- Neue Zeit-Arten wie in Plancraft (Mika, 18.10.2026): Bildung (Schulung, Berufsschule) und Feiertag.
-- Die Werte werden erst im Code und in späteren Migrationen benutzt (Postgres erlaubt neue Enum-Werte nicht in derselben Transaktion).
alter type public.zeit_art add value if not exists 'bildung';
alter type public.zeit_art add value if not exists 'feiertag';
