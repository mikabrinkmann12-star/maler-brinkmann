-- Textvorlagen für Angebote (Mika, 18.10.2026): beliebig viele benannte Vorlagen, getrennt für Anfangstext und Schlusstext.
-- Der Admin pflegt sie in den Einstellungen; im Angebot wählt das Büro eine Vorlage, ihr Text wird eingesetzt und bleibt änderbar.
-- Eine Vorlage je Art kann „Standard“ sein: Sie füllt neue Angebote vor (sonst gilt der Text aus „Angebote – Vorgaben“).

create type public.textvorlage_art as enum ('einleitung', 'schlusstext');

create table public.text_templates (
  id            uuid primary key default gen_random_uuid(),
  art           public.textvorlage_art not null,
  name          text not null check (length(btrim(name)) between 1 and 80),
  inhalt        text not null check (length(btrim(inhalt)) > 0 and length(inhalt) <= 3000),
  standard      boolean not null default false,
  archiviert_am timestamptz,
  created_by    uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Ein Name je Art nur einmal (ohne Groß-/Kleinschreibung, nur nicht archivierte); höchstens eine Standard-Vorlage je Art.
create unique index text_templates_name_eindeutig
  on public.text_templates (art, lower(btrim(name))) where archiviert_am is null;
create unique index text_templates_ein_standard
  on public.text_templates (art) where standard and archiviert_am is null;

create trigger text_templates_updated_at before update on public.text_templates
  for each row execute function public.setze_updated_at();
create trigger text_templates_audit after insert or update or delete on public.text_templates
  for each row execute function public.protokolliere_aenderung();

alter table public.text_templates enable row level security;

-- Lesen: Büro und Admin (das Büro wählt sie im Angebot). Anlegen/ändern: nur der Admin. Kein DELETE (archivieren).
create policy text_templates_lesen on public.text_templates
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy text_templates_anlegen on public.text_templates
  for insert to authenticated with check ((select public.ist_admin()));
create policy text_templates_aendern on public.text_templates
  for update to authenticated
  using ((select public.ist_admin())) with check ((select public.ist_admin()));
