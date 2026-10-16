-- =============================================================================
-- Katalog: Materialien und Leistungen in Ordnern (Phase 3, Entscheidungen mit Mika, 16.10.2026)
--
-- - Ordner mit beliebig vielen Unterordnern, getrennt für Materialien und Leistungen
--   (catalog_folders.art).
-- - Einkaufspreis/Kosten + Zuschlag % → Verkaufspreis. Der Verkaufspreis ist immer
--   berechnet (generierte Spalte), nie von Hand eingetragen.
-- - Nur Büro und Admin sehen und pflegen den Katalog (Mitarbeiter sollen keine
--   Preise sehen). Nichts wird gelöscht, nur archiviert.
-- =============================================================================

create type public.katalog_art as enum ('material', 'leistung');


-- -----------------------------------------------------------------------------
-- Ordner
-- -----------------------------------------------------------------------------
create table public.catalog_folders (
  id            uuid primary key default gen_random_uuid(),
  art           public.katalog_art not null,
  parent_id     uuid references public.catalog_folders (id),
  name          text not null check (length(btrim(name)) between 1 and 100),
  archiviert_am timestamptz,
  created_by    uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index catalog_folders_parent_idx on public.catalog_folders (parent_id);

-- Im selben Ordner darf ein Name nur einmal vorkommen (ohne Groß-/Kleinschreibung, nur nicht archivierte).
create unique index catalog_folders_name_eindeutig
  on public.catalog_folders (art, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)))
  where archiviert_am is null;


-- -----------------------------------------------------------------------------
-- Materialien
-- -----------------------------------------------------------------------------
create table public.materials (
  id               uuid primary key default gen_random_uuid(),
  folder_id        uuid references public.catalog_folders (id),
  artikelnr        text check (length(artikelnr) <= 50),
  name             text not null check (length(btrim(name)) between 1 and 200),
  beschreibung     text check (length(beschreibung) <= 2000),
  lieferant        text check (length(lieferant) <= 100),
  einheit          text not null check (length(btrim(einheit)) between 1 and 20),
  ek               numeric(12, 4) not null default 0 check (ek >= 0 and ek <= 1000000),
  zuschlag_prozent numeric(6, 2) not null default 0 check (zuschlag_prozent between 0 and 999),
  vk               numeric(12, 2) generated always as (round(ek * (1 + zuschlag_prozent / 100), 2)) stored,
  archiviert_am    timestamptz,
  created_by       uuid references public.profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index materials_folder_idx on public.materials (folder_id);
create index materials_artikelnr_idx on public.materials (artikelnr);


-- -----------------------------------------------------------------------------
-- Leistungen
-- -----------------------------------------------------------------------------
create table public.services (
  id               uuid primary key default gen_random_uuid(),
  folder_id        uuid references public.catalog_folders (id),
  nummer           text check (length(nummer) <= 50),
  name             text not null check (length(btrim(name)) between 1 and 200),
  langtext         text check (length(langtext) <= 5000),
  einheit          text not null check (length(btrim(einheit)) between 1 and 20),
  kosten           numeric(12, 4) not null default 0 check (kosten >= 0 and kosten <= 1000000),
  zuschlag_prozent numeric(6, 2) not null default 0 check (zuschlag_prozent between 0 and 999),
  vk               numeric(12, 2) generated always as (round(kosten * (1 + zuschlag_prozent / 100), 2)) stored,
  archiviert_am    timestamptz,
  created_by       uuid references public.profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index services_folder_idx on public.services (folder_id);


-- -----------------------------------------------------------------------------
-- Prüfungen: Ordner passen zur Art, keine Ordner-Schleifen
-- -----------------------------------------------------------------------------
create function public.katalog_ordner_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_art public.katalog_art;
begin
  if tg_op = 'UPDATE' and new.art is distinct from old.art then
    raise exception 'Die Art eines Ordners kann nicht geändert werden.' using errcode = 'P0001';
  end if;

  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Ein Ordner kann nicht in sich selbst liegen.' using errcode = 'P0001';
    end if;
    select art into v_parent_art from public.catalog_folders where id = new.parent_id;
    if v_parent_art is distinct from new.art then
      raise exception 'Der übergeordnete Ordner gehört zu einer anderen Art (Material/Leistung).' using errcode = 'P0001';
    end if;
    -- Schleife: Ist der neue übergeordnete Ordner ein Nachfahre dieses Ordners?
    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id and exists (
      with recursive vorfahren as (
        select id, parent_id from public.catalog_folders where id = new.parent_id
        union all
        select f.id, f.parent_id from public.catalog_folders f join vorfahren v on f.id = v.parent_id
      )
      select 1 from vorfahren where id = new.id
    ) then
      raise exception 'Der Ordner kann nicht in einen seiner eigenen Unterordner verschoben werden.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger catalog_folders_pruefen
  before insert or update on public.catalog_folders
  for each row execute function public.katalog_ordner_pruefen();

create function public.katalog_eintrag_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_art public.katalog_art;
begin
  if new.folder_id is not null then
    select art into v_art from public.catalog_folders where id = new.folder_id;
    if v_art is distinct from (case tg_table_name when 'materials' then 'material' else 'leistung' end)::public.katalog_art then
      raise exception 'Der Ordner passt nicht zu diesem Eintrag (Material/Leistung).' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger materials_pruefen
  before insert or update on public.materials
  for each row execute function public.katalog_eintrag_pruefen();
create trigger services_pruefen
  before insert or update on public.services
  for each row execute function public.katalog_eintrag_pruefen();

create trigger catalog_folders_updated_at before update on public.catalog_folders
  for each row execute function public.setze_updated_at();
create trigger materials_updated_at before update on public.materials
  for each row execute function public.setze_updated_at();
create trigger services_updated_at before update on public.services
  for each row execute function public.setze_updated_at();

create trigger catalog_folders_audit after insert or update or delete on public.catalog_folders
  for each row execute function public.protokolliere_aenderung();
create trigger materials_audit after insert or update or delete on public.materials
  for each row execute function public.protokolliere_aenderung();
create trigger services_audit after insert or update or delete on public.services
  for each row execute function public.protokolliere_aenderung();

revoke execute on function public.katalog_ordner_pruefen()  from public, anon, authenticated;
revoke execute on function public.katalog_eintrag_pruefen() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Rechte (RLS): nur Büro und Admin; kein DELETE (archivieren)
-- -----------------------------------------------------------------------------
alter table public.catalog_folders enable row level security;
alter table public.materials       enable row level security;
alter table public.services        enable row level security;

create policy catalog_folders_lesen on public.catalog_folders
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy catalog_folders_anlegen on public.catalog_folders
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy catalog_folders_aendern on public.catalog_folders
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));

create policy materials_lesen on public.materials
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy materials_anlegen on public.materials
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy materials_aendern on public.materials
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));

create policy services_lesen on public.services
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy services_anlegen on public.services
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy services_aendern on public.services
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));
