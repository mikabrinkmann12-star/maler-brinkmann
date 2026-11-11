-- Glas-Look wieder entfernt (Mika, 11.11.2026: „ne weg“). Die Spalte aus 20261112110000_darstellung_glas wird nicht mehr gebraucht.
alter table public.nutzer_darstellung drop column if exists glas;
