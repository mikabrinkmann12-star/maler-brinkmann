-- Materialliste (Mika, 18.10.2026): wie die Arbeitsanweisung eine Liste ohne Preise, die das Büro prüft, ergänzt und für die
-- Mitarbeiter des Projekts freigibt. Sie nutzt dieselbe Tabelle (Rechte und Freigabe sind gleich), unterschieden durch `art`.
-- Hinweis: Die Tabelle heißt weiter work_instructions (Arbeitsanweisungen und Materiallisten).

alter table public.work_instructions
  add column art text not null default 'arbeitsanweisung' check (art in ('arbeitsanweisung', 'materialliste'));

-- Pro Angebot und Art höchstens eine aktive Liste (vorher nur pro Angebot).
drop index public.work_instructions_pro_angebot;
create unique index work_instructions_pro_angebot
  on public.work_instructions (quote_id, art) where quote_id is not null and archiviert_am is null;
