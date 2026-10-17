-- Ablage mit Dateien (Mika, 18.10.2026): Mitglieder und Büro laden Dateien (PDF, Word, Excel …) zu einem Projekt hoch.
-- Rechte wie bei den Fotos: Büro/Admin alles, Mitglieder des Projekts lesen und laden hoch, eigene ändern/archivieren;
-- bei archivierten Projekten sind die Dateien für alle lesbar (wie Notizen und Fotos). Nichts wird gelöscht (archivieren).

create table public.project_files (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id),
  storage_pfad   text not null unique,  -- <project_id>/<id>.<endung> im Bucket "projektdateien"
  dateiname      text not null check (length(btrim(dateiname)) between 1 and 200),
  mime           text check (length(mime) <= 150),
  groesse_bytes  bigint check (groesse_bytes between 0 and 20971520),
  erstellt_von   uuid references public.profiles (id) default auth.uid(),
  archiviert_am  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint project_files_pfad check (storage_pfad like project_id::text || '/%')
);
create index project_files_project_idx on public.project_files (project_id);

create trigger project_files_ersteller before update on public.project_files
  for each row execute function public.ersteller_festhalten();
create trigger project_files_updated_at before update on public.project_files
  for each row execute function public.setze_updated_at();
create trigger project_files_audit after insert or update or delete on public.project_files
  for each row execute function public.protokolliere_aenderung();

alter table public.project_files enable row level security;

create policy project_files_lesen on public.project_files for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));
create policy project_files_lesen_archiv on public.project_files for select to authenticated
  using (public.ist_archiviertes_projekt(project_id));
create policy project_files_anlegen on public.project_files for insert to authenticated
  with check (erstellt_von = (select auth.uid())
    and ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id)));
create policy project_files_aendern on public.project_files for update to authenticated
  using ((select public.ist_buero_oder_admin())
    or (erstellt_von = (select auth.uid()) and public.ist_projektmitglied(project_id)))
  with check ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));

-- Speicher: privater Bucket, Pfad <project_id>/<datei>, höchstens 20 MB, nur Dokument-Typen (Bilder gehören zu den Fotos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('projektdateien', 'projektdateien', false, 20971520, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain',
  'text/csv',
  'application/zip'
])
on conflict (id) do nothing;

create policy projektdateien_lesen on storage.objects for select to authenticated
  using (
    bucket_id = 'projektdateien'
    and ((select public.ist_buero_oder_admin())
      or public.ist_projektmitglied(public.projekt_aus_pfad(name))
      or public.ist_archiviertes_projekt(public.projekt_aus_pfad(name)))
  );
create policy projektdateien_hochladen on storage.objects for insert to authenticated
  with check (
    bucket_id = 'projektdateien'
    and public.projekt_aus_pfad(name) is not null
    and ((select public.ist_buero_oder_admin())
      or public.ist_projektmitglied(public.projekt_aus_pfad(name)))
  );
-- Kein Ändern/Löschen von Dateien über die App (archivieren über project_files).
