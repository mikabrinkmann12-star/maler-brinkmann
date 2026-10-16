-- =============================================================================
-- Angebote (Phase 4, Entscheidungen mit Mika, 17.10.2026)
--
-- - Ein Angebot gehört immer zu einem Projekt. Keine eigene Angebotsnummer
--   (wie in Plancraft: im Kopf stehen Kundennummer, Projektnummer und Datum).
-- - Bausteine (quote_items): Titel, Position, Text, Zwischensumme, Bild.
-- - Positionen kopieren Text, Einheit und Preis (aus dem Katalog oder von Hand).
--   Spätere Katalogänderungen ändern bestehende Angebote nie.
-- - Netto/Rabatt/USt./Brutto werden von der App berechnet (src/lib/angebot.ts).
-- - Nur Büro und Admin (Mitarbeiter sehen keine Preise). Nichts wird gelöscht,
--   Angebote werden archiviert. Nach dem Versand ist ein Angebot gesperrt.
-- =============================================================================

create type public.angebot_status as enum ('entwurf', 'versendet', 'angenommen', 'abgelehnt');
create type public.angebot_baustein as enum ('position', 'titel', 'text', 'zwischensumme', 'bild');


-- -----------------------------------------------------------------------------
-- Angebote
-- -----------------------------------------------------------------------------
create table public.quotes (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id),
  status          public.angebot_status not null default 'entwurf',
  betreff         text not null check (length(btrim(betreff)) between 1 and 200),
  leistungsort    text check (length(leistungsort) <= 300),
  datum           date not null default current_date,
  empfaenger      text check (length(empfaenger) <= 500),
  einleitung      text check (length(einleitung) <= 3000),
  schlusstext     text check (length(schlusstext) <= 3000),
  steuersatz      numeric(4, 2) not null default 19 check (steuersatz in (0, 7, 19)),
  reverse_charge  boolean not null default false,
  rabatt_prozent  numeric(5, 2) not null default 0 check (rabatt_prozent between 0 and 100),
  archiviert_am   timestamptz,
  created_by      uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint quotes_reverse_charge_ohne_ust check (not reverse_charge or steuersatz = 0)
);
create index quotes_project_idx on public.quotes (project_id);
create index quotes_status_idx on public.quotes (status);


-- -----------------------------------------------------------------------------
-- Bausteine eines Angebots
-- -----------------------------------------------------------------------------
create table public.quote_items (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references public.quotes (id),
  sortierung   integer not null check (sortierung >= 0),
  typ          public.angebot_baustein not null,
  kurztext     text check (length(kurztext) <= 200),
  langtext     text check (length(langtext) <= 5000),
  menge        numeric(12, 3) check (menge between -1000000 and 1000000),
  einheit      text check (length(einheit) <= 20),
  einzelpreis  numeric(12, 2) check (einzelpreis between -1000000 and 1000000),
  bild_pfad    text check (length(bild_pfad) <= 300),
  material_id  uuid references public.materials (id),
  service_id   uuid references public.services (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint quote_items_position_vollstaendig
    check (typ <> 'position' or (menge is not null and einheit is not null and btrim(einheit) <> '' and einzelpreis is not null
                                 and btrim(coalesce(kurztext, '') || coalesce(langtext, '')) <> '')),
  constraint quote_items_titel_text check (typ <> 'titel' or btrim(coalesce(kurztext, '')) <> ''),
  constraint quote_items_text_text check (typ <> 'text' or btrim(coalesce(langtext, '')) <> ''),
  constraint quote_items_bild_pfad check (typ <> 'bild' or (bild_pfad is not null and bild_pfad like quote_id::text || '/%')),
  constraint quote_items_nur_eine_quelle check (material_id is null or service_id is null)
);
create index quote_items_quote_idx on public.quote_items (quote_id, sortierung);


-- -----------------------------------------------------------------------------
-- Schutz: Nach dem Versand ist der Inhalt gesperrt
-- -----------------------------------------------------------------------------
create function public.angebot_sperre_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'Ein Angebot kann nicht in ein anderes Projekt verschoben werden.' using errcode = 'P0001';
  end if;
  -- Status bleibt gleich und ist nicht „Entwurf“: Inhalt darf sich nicht ändern (Archivieren schon).
  if old.status <> 'entwurf' and new.status = old.status and (
       new.betreff is distinct from old.betreff
    or new.leistungsort is distinct from old.leistungsort
    or new.datum is distinct from old.datum
    or new.empfaenger is distinct from old.empfaenger
    or new.einleitung is distinct from old.einleitung
    or new.schlusstext is distinct from old.schlusstext
    or new.steuersatz is distinct from old.steuersatz
    or new.reverse_charge is distinct from old.reverse_charge
    or new.rabatt_prozent is distinct from old.rabatt_prozent
  ) then
    raise exception 'Dieses Angebot wurde schon versendet und ist gesperrt. Setze es zuerst zurück auf Entwurf.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger quotes_sperre
  before update on public.quotes
  for each row execute function public.angebot_sperre_pruefen();

create function public.angebot_baustein_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_quote uuid := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  v_status public.angebot_status;
begin
  if tg_op = 'UPDATE' and new.quote_id is distinct from old.quote_id then
    raise exception 'Ein Baustein kann nicht in ein anderes Angebot verschoben werden.' using errcode = 'P0001';
  end if;
  select status into v_status from public.quotes where id = v_quote;
  if v_status is distinct from 'entwurf'::public.angebot_status then
    raise exception 'Dieses Angebot wurde schon versendet und ist gesperrt. Setze es zuerst zurück auf Entwurf.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger quote_items_sperre
  before insert or update or delete on public.quote_items
  for each row execute function public.angebot_baustein_pruefen();

create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.setze_updated_at();
create trigger quote_items_updated_at before update on public.quote_items
  for each row execute function public.setze_updated_at();

create trigger quotes_audit after insert or update or delete on public.quotes
  for each row execute function public.protokolliere_aenderung();
create trigger quote_items_audit after insert or update or delete on public.quote_items
  for each row execute function public.protokolliere_aenderung();

revoke execute on function public.angebot_sperre_pruefen()    from public, anon, authenticated;
revoke execute on function public.angebot_baustein_pruefen()  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Rechte (RLS): nur Büro und Admin. Angebote werden nie gelöscht (archivieren).
-- Bausteine dürfen im Entwurf gelöscht werden (Trigger oben sperrt sonst).
-- -----------------------------------------------------------------------------
alter table public.quotes      enable row level security;
alter table public.quote_items enable row level security;

create policy quotes_lesen on public.quotes
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy quotes_anlegen on public.quotes
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy quotes_aendern on public.quotes
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));

create policy quote_items_lesen on public.quote_items
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy quote_items_anlegen on public.quote_items
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy quote_items_aendern on public.quote_items
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));
create policy quote_items_loeschen on public.quote_items
  for delete to authenticated using ((select public.ist_buero_oder_admin()));


-- -----------------------------------------------------------------------------
-- Storage: privater Bucket für Bilder in Angeboten (Pfad <quote_id>/<datei>), nur Büro/Admin
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('angebotsbilder', 'angebotsbilder', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy angebotsbilder_lesen on storage.objects for select to authenticated
  using (bucket_id = 'angebotsbilder' and (select public.ist_buero_oder_admin()));
create policy angebotsbilder_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'angebotsbilder' and (select public.ist_buero_oder_admin()));
