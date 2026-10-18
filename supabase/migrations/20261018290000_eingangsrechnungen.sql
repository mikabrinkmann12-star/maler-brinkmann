-- Eingangsrechnungen (Mika, 18.10.2026): Rechnungen, die der Betrieb von Lieferanten bekommt, wie in Plancraft.
-- Nur Büro/Admin. Nichts wird gelöscht (archivieren). Die Datei liegt im privaten Bucket "eingangsrechnungen".
-- Die App liest Rechnungsnummer, Datum, Beträge usw. automatisch aus E-Rechnung (XML/ZUGFeRD) oder dem PDF-Text aus;
-- solche Rechnungen bleiben "zu prüfen", bis ein Mensch sie bestätigt. Das ist keine Buchhaltung (die bleibt in Lexware).

create table public.incoming_invoices (
  id              uuid primary key default gen_random_uuid(),
  lieferant       text not null default '' check (length(lieferant) <= 200),
  contact_id      uuid references public.contacts (id),
  rechnungsnummer text check (length(rechnungsnummer) <= 100),
  rechnungsdatum  date,
  faellig_am      date,
  netto           numeric(12,2),
  brutto          numeric(12,2),
  iban            text check (length(iban) <= 40),
  zahlstatus      text not null default 'offen' check (zahlstatus in ('offen', 'bezahlt')),
  bezahlt_am      date,
  -- Kostenzuweisung: entweder ein Projekt oder ein Betriebsbereich, nie beides
  project_id      uuid references public.projects (id),
  bereich         text check (bereich in ('lager', 'buero', 'mitarbeiter')),
  zu_pruefen      boolean not null default true,
  notiz           text check (length(notiz) <= 2000),
  storage_pfad    text not null unique,  -- <id>.<endung> im Bucket "eingangsrechnungen"
  dateiname       text not null check (length(btrim(dateiname)) between 1 and 200),
  mime            text check (length(mime) <= 150),
  groesse_bytes   bigint check (groesse_bytes between 0 and 20971520),
  datei_hash      text,                  -- SHA-256 der Datei, damit dieselbe Datei nicht doppelt angelegt wird
  quelle          text not null default 'upload' check (quelle in ('upload', 'email')),
  absender        text check (length(absender) <= 300),
  erkannt_aus     text check (erkannt_aus in ('e-rechnung', 'pdf-text', 'keine')),
  erstellt_von    uuid references public.profiles (id) default auth.uid(),
  bearbeitet_von  uuid references public.profiles (id),
  archiviert_am   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint incoming_invoices_zuweisung check (project_id is null or bereich is null),
  constraint incoming_invoices_bezahlt check (zahlstatus = 'bezahlt' or bezahlt_am is null)
);
create index incoming_invoices_projekt_idx on public.incoming_invoices (project_id);
create index incoming_invoices_datum_idx on public.incoming_invoices (rechnungsdatum desc);
create unique index incoming_invoices_hash_eindeutig on public.incoming_invoices (datei_hash)
  where archiviert_am is null and datei_hash is not null;

create function public.eingangsrechnung_bearbeiter_festhalten()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.bearbeitet_von := auth.uid();
  return new;
end;
$$;
revoke execute on function public.eingangsrechnung_bearbeiter_festhalten() from public, anon, authenticated;

create trigger incoming_invoices_ersteller before update on public.incoming_invoices
  for each row execute function public.ersteller_festhalten();
create trigger incoming_invoices_bearbeiter before insert or update on public.incoming_invoices
  for each row execute function public.eingangsrechnung_bearbeiter_festhalten();
create trigger incoming_invoices_updated_at before update on public.incoming_invoices
  for each row execute function public.setze_updated_at();
create trigger incoming_invoices_audit after insert or update or delete on public.incoming_invoices
  for each row execute function public.protokolliere_aenderung();

alter table public.incoming_invoices enable row level security;
revoke truncate on public.incoming_invoices from anon, authenticated;

create policy incoming_invoices_lesen on public.incoming_invoices for select to authenticated
  using ((select public.ist_buero_oder_admin()));
create policy incoming_invoices_anlegen on public.incoming_invoices for insert to authenticated
  with check ((select public.ist_buero_oder_admin()) and erstellt_von = (select auth.uid()));
create policy incoming_invoices_aendern on public.incoming_invoices for update to authenticated
  using ((select public.ist_buero_oder_admin()))
  with check ((select public.ist_buero_oder_admin()));
-- Kein DELETE: Rechnungen werden archiviert.

-- Speicher: privater Bucket, nur Büro/Admin, höchstens 20 MB; PDF, XML (E-Rechnung) und Fotos/Scans von Rechnungen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('eingangsrechnungen', 'eingangsrechnungen', false, 20971520, array[
  'application/pdf',
  'application/xml',
  'text/xml',
  'image/jpeg',
  'image/png'
])
on conflict (id) do nothing;

create policy eingangsrechnungen_lesen on storage.objects for select to authenticated
  using (bucket_id = 'eingangsrechnungen' and (select public.ist_buero_oder_admin()));
create policy eingangsrechnungen_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'eingangsrechnungen' and (select public.ist_buero_oder_admin()));
-- Kein Ändern/Löschen von Dateien über die App (archivieren über incoming_invoices).
