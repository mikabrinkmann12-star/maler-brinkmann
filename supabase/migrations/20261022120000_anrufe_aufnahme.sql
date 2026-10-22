-- Anrufe: Link zur Sprachaufnahme des Gesprächs (vom Telefon-Dienst gehostet oder eine Datei der App), zum Anhören direkt in der Liste.
-- Nur https-Adressen oder Pfade der App (beginnen mit „/“), damit keine fremden Schemata in die Seite kommen.
alter table public.calls add column aufnahme_url text
  check (aufnahme_url is null or (length(aufnahme_url) <= 1000 and aufnahme_url ~ '^(https://|/[^/])'));
