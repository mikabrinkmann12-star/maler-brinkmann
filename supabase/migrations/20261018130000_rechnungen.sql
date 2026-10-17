-- =============================================================================
-- Rechnungen (Phase 5, Wunsch von Mika, 18.10.2026)
--
-- Die Rechnung wird in der App vorbereitet (aus dem Angebot), an Lexware Office übertragen und dort FINALISIERT.
-- Lexware vergibt die Rechnungsnummer und erzeugt das PDF; beides kommt zurück in die App und wird hier als Spiegel
-- gespeichert (HARTE REGEL: Die App vergibt nie selbst eine Rechnungsnummer und erzeugt nie selbst ein Rechnungs-PDF).
-- Nur Büro und Admin. Nichts wird gelöscht. Übertragene Rechnungen sind gesperrt (GoBD).
-- =============================================================================

create type public.rechnung_status as enum ('entwurf', 'wird_uebertragen', 'uebertragen');
create type public.rechnung_baustein as enum ('position', 'text');

create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id),
  quote_id          uuid references public.quotes (id),
  contact_id        uuid not null references public.contacts (id),
  status            public.rechnung_status not null default 'entwurf',
  betreff           text not null check (length(btrim(betreff)) between 1 and 200),
  rechnungsdatum    date not null default current_date,
  leistung_von      date not null default current_date,
  leistung_bis      date not null default current_date,
  zahlungsziel_tage integer not null default 14 check (zahlungsziel_tage between 0 and 365),
  skonto_prozent    numeric(4, 2) check (skonto_prozent between 0 and 20),
  skonto_tage       integer check (skonto_tage between 1 and 365),
  steuersatz        numeric(4, 2) not null default 19 check (steuersatz in (0, 7, 19)),
  reverse_charge    boolean not null default false,
  rabatt_prozent    numeric(5, 2) not null default 0 check (rabatt_prozent between 0 and 100),
  einleitung        text check (length(einleitung) <= 3000),
  schlusstext       text check (length(schlusstext) <= 3000),
  -- Spiegel von Lexware (erst nach der Übertragung gefüllt)
  lexware_id        uuid unique,
  rechnungsnummer   text check (length(rechnungsnummer) <= 50),
  lexware_status    text check (length(lexware_status) <= 20),
  netto             numeric(12, 2),
  brutto            numeric(12, 2),
  uebertragen_am    timestamptz,
  abgeglichen_am    timestamptz,
  pdf_pfad          text check (length(pdf_pfad) <= 300),
  archiviert_am     timestamptz,
  created_by        uuid references public.profiles (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint invoices_reverse_charge_ohne_ust check (not reverse_charge or steuersatz = 0),
  constraint invoices_skonto_zusammen check ((skonto_prozent is null) = (skonto_tage is null)),
  constraint invoices_leistungszeitraum check (leistung_bis >= leistung_von)
);
create index invoices_project_idx on public.invoices (project_id);
create index invoices_quote_idx on public.invoices (quote_id);

create table public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices (id),
  sortierung   integer not null check (sortierung >= 0),
  typ          public.rechnung_baustein not null,
  kurztext     text check (length(kurztext) <= 200),
  langtext     text check (length(langtext) <= 5000),
  menge        numeric(12, 3) check (menge between -1000000 and 1000000),
  einheit      text check (length(einheit) <= 20),
  einzelpreis  numeric(12, 2) check (einzelpreis between -1000000 and 1000000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint invoice_items_position_vollstaendig
    check (typ <> 'position' or (menge is not null and einheit is not null and btrim(einheit) <> '' and einzelpreis is not null
                                 and btrim(coalesce(kurztext, '') || coalesce(langtext, '')) <> '')),
  constraint invoice_items_text_text check (typ <> 'text' or btrim(coalesce(kurztext, '') || coalesce(langtext, '')) <> '')
);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, sortierung);


-- -----------------------------------------------------------------------------
-- Sperre: Nur im Status „entwurf“ ändert sich der Inhalt (Rechnungsdatum, Texte, Beträge, Bausteine).
-- Die Übertragung selbst (Status, Lexware-Felder, PDF, Archiv) bleibt immer möglich.
-- -----------------------------------------------------------------------------
create function public.rechnung_sperre_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id or new.contact_id is distinct from old.contact_id
     or new.quote_id is distinct from old.quote_id then
    raise exception 'Projekt, Kunde und Angebot einer Rechnung lassen sich nicht ändern.' using errcode = 'P0001';
  end if;
  if old.status <> 'entwurf' and (
       new.betreff is distinct from old.betreff
    or new.rechnungsdatum is distinct from old.rechnungsdatum
    or new.leistung_von is distinct from old.leistung_von
    or new.leistung_bis is distinct from old.leistung_bis
    or new.zahlungsziel_tage is distinct from old.zahlungsziel_tage
    or new.skonto_prozent is distinct from old.skonto_prozent
    or new.skonto_tage is distinct from old.skonto_tage
    or new.steuersatz is distinct from old.steuersatz
    or new.reverse_charge is distinct from old.reverse_charge
    or new.rabatt_prozent is distinct from old.rabatt_prozent
    or new.einleitung is distinct from old.einleitung
    or new.schlusstext is distinct from old.schlusstext
  ) then
    raise exception 'Diese Rechnung wurde schon an Lexware übertragen und ist gesperrt.' using errcode = 'P0001';
  end if;
  -- Eine übertragene Rechnung wird nie wieder zum Entwurf.
  if old.status = 'uebertragen' and new.status <> 'uebertragen' then
    raise exception 'Eine übertragene Rechnung kann nicht zurück auf Entwurf gesetzt werden.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger invoices_sperre
  before update on public.invoices
  for each row execute function public.rechnung_sperre_pruefen();

create function public.rechnung_baustein_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_invoice uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  v_status public.rechnung_status;
begin
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'Ein Baustein kann nicht in eine andere Rechnung verschoben werden.' using errcode = 'P0001';
  end if;
  select status into v_status from public.invoices where id = v_invoice;
  if v_status is distinct from 'entwurf'::public.rechnung_status then
    raise exception 'Diese Rechnung wurde schon an Lexware übertragen und ist gesperrt.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger invoice_items_sperre
  before insert or update or delete on public.invoice_items
  for each row execute function public.rechnung_baustein_pruefen();

create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.setze_updated_at();
create trigger invoice_items_updated_at before update on public.invoice_items
  for each row execute function public.setze_updated_at();
create trigger invoices_audit after insert or update or delete on public.invoices
  for each row execute function public.protokolliere_aenderung();
create trigger invoice_items_audit after insert or update or delete on public.invoice_items
  for each row execute function public.protokolliere_aenderung();

revoke execute on function public.rechnung_sperre_pruefen()    from public, anon, authenticated;
revoke execute on function public.rechnung_baustein_pruefen()  from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Rechte (RLS): nur Büro und Admin, kein DELETE bei Rechnungen; Bausteine nur im Entwurf löschbar (Trigger)
-- -----------------------------------------------------------------------------
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;

create policy invoices_lesen on public.invoices
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy invoices_anlegen on public.invoices
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy invoices_aendern on public.invoices
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));

create policy invoice_items_lesen on public.invoice_items
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy invoice_items_anlegen on public.invoice_items
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy invoice_items_aendern on public.invoice_items
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));
create policy invoice_items_loeschen on public.invoice_items
  for delete to authenticated using ((select public.ist_buero_oder_admin()));


-- -----------------------------------------------------------------------------
-- Storage: privater Bucket für die PDF-Kopien aus Lexware (Pfad <invoice_id>.pdf), nur Büro/Admin
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rechnungen', 'rechnungen', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy rechnungen_lesen on storage.objects for select to authenticated
  using (bucket_id = 'rechnungen' and (select public.ist_buero_oder_admin()));
create policy rechnungen_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'rechnungen' and (select public.ist_buero_oder_admin()));
create policy rechnungen_ueberschreiben on storage.objects for update to authenticated
  using (bucket_id = 'rechnungen' and (select public.ist_buero_oder_admin()))
  with check (bucket_id = 'rechnungen' and (select public.ist_buero_oder_admin()));
