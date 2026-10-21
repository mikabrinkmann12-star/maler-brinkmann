-- Weitere Dokumentarten im Dokument-Editor (Mika, 21.10.2026, wie in Plancraft „Neues Dokument“): Angebot, Kostenvoranschlag,
-- Auftragsbestätigung, Lieferschein, Bestellschein und Brief teilen sich Editor, PDF und Liste der Angebote. „Als Nachtrag“ markiert
-- ein Nachtragsdokument. Rechnungen und Gutschriften bleiben bei der Buchhaltung (Lexware), sie sind hier nicht dabei.

alter table public.quotes
  add column dokumentart text not null default 'angebot'
    check (dokumentart in ('angebot', 'kostenvoranschlag', 'auftragsbestaetigung', 'lieferschein', 'bestellschein', 'brief')),
  add column nachtrag boolean not null default false;
