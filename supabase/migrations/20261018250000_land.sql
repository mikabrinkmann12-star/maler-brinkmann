-- Adressen mit Land (Mika, 18.10.2026, wie in Plancraft): Beim Eintippen einer Straße schlägt die App Adressen vor und füllt
-- PLZ, Stadt und Land aus. Vorgabe ist Deutschland, bestehende Datensätze bleiben unverändert (also Deutschland).

alter table public.contacts add column land text not null default 'Deutschland' check (length(btrim(land)) between 1 and 60);
alter table public.projects add column land text not null default 'Deutschland' check (length(btrim(land)) between 1 and 60);
