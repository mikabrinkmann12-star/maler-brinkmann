-- Angebot per E-Mail verschickt: wann und an wen (letzter Versand). Der Inhalt bleibt wie vorher durch den Trigger gesperrt,
-- diese beiden Spalten dürfen sich immer ändern.
alter table public.quotes
  add column versendet_am timestamptz,
  add column versendet_an text check (length(versendet_an) <= 320);
