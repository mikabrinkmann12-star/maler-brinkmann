-- sevdesk im Hintergrund (Mika, 20.10.2026): Rechnungen werden weiter in der App vorbereitet und bedient; im Hintergrund legt sevdesk
-- Rechnungsnummer, PDF/E-Rechnung und Buchhaltung an (statt Lexware). Bereits an Lexware übertragene Rechnungen bleiben wie sie sind.
-- `lexware_status` heißt weiter so, ist aber der bereinigte Status beider Anbieter (draft / open / paid / voided).

alter table public.invoices
  add column anbieter       text not null default 'lexware' check (anbieter in ('lexware', 'sevdesk')),
  add column sevdesk_id     text unique check (length(sevdesk_id) <= 20),
  add column versendet_am   timestamptz,
  add column versendet_an   text check (length(versendet_an) <= 320),
  add column bezahlt_am     date,
  add column storniert_am   timestamptz;

alter table public.contacts
  add column sevdesk_contact_id text unique check (length(sevdesk_contact_id) <= 20);

-- Mahnungen und Zahlungserinnerungen, die die App über sevdesk angelegt hat (Verlauf je Rechnung; nichts wird gelöscht)
create table public.invoice_reminders (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices (id),
  stufe        integer not null check (stufe between 1 and 3),
  sevdesk_id   text check (length(sevdesk_id) <= 20),
  versendet_an text check (length(versendet_an) <= 320),
  versendet_am timestamptz,
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now()
);
create index invoice_reminders_invoice_idx on public.invoice_reminders (invoice_id, created_at desc);

create trigger invoice_reminders_audit after insert or update or delete on public.invoice_reminders
  for each row execute function public.protokolliere_aenderung();

alter table public.invoice_reminders enable row level security;
revoke truncate on public.invoice_reminders from anon, authenticated;

create policy invoice_reminders_lesen on public.invoice_reminders
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy invoice_reminders_anlegen on public.invoice_reminders
  for insert to authenticated with check ((select public.ist_buero_oder_admin()) and created_by = (select auth.uid()));
create policy invoice_reminders_aendern on public.invoice_reminders
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));
-- Kein DELETE.

-- Die Rechnungsdatei kann auch XML sein (XRechnung): der Bucket darf neben PDF auch XML aufnehmen.
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'application/xml', 'text/xml']
 where id = 'rechnungen';
