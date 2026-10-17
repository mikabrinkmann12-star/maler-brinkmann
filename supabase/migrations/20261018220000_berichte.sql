-- Berichte zu einem Projekt (Mika, 18.10.2026): zuerst der Bautagesbericht, später weitere Arten (Regiebericht, Abnahmeprotokoll …).
-- Der art-spezifische Inhalt liegt als JSON in `daten` (die App prüft ihn mit zod), das Gemeinsame in Spalten.
-- Mitglieder des Projekts und Büro/Admin schreiben Berichte. Ein Bericht ist erst ein Entwurf (änderbar), nach „Abschließen“
-- unveränderlich (auch die Unterschrift des Kunden, die als Bild im privaten Speicher liegt). Nichts wird gelöscht.

create table public.project_reports (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id),
  art                text not null check (art in ('bautagesbericht')),
  datum              date not null,
  status             text not null default 'entwurf' check (status in ('entwurf', 'abgeschlossen')),
  daten              jsonb not null default '{}'::jsonb check (octet_length(daten::text) <= 30000),
  unterschrift_name  text check (length(btrim(unterschrift_name)) between 1 and 100),
  unterschrift_pfad  text,  -- <project_id>/<id>.png im Bucket "berichtunterschriften"
  unterschrieben_am  timestamptz,
  abgeschlossen_am   timestamptz,
  erstellt_von       uuid references public.profiles (id) default auth.uid(),
  archiviert_am      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint project_reports_pfad check (unterschrift_pfad is null or unterschrift_pfad like project_id::text || '/%'),
  -- Unterschrift = Bild und Name zusammen, nur bei abgeschlossenen Berichten
  constraint project_reports_unterschrift check (
    (unterschrift_pfad is null) = (unterschrift_name is null)
    and (unterschrift_pfad is null) = (unterschrieben_am is null)
    and (unterschrift_pfad is null or status = 'abgeschlossen')
  )
);
create index project_reports_project_idx on public.project_reports (project_id, datum desc);

create trigger project_reports_ersteller before update on public.project_reports
  for each row execute function public.ersteller_festhalten();
create trigger project_reports_updated_at before update on public.project_reports
  for each row execute function public.setze_updated_at();
create trigger project_reports_audit after insert or update or delete on public.project_reports
  for each row execute function public.protokolliere_aenderung();

-- Schutz: Projekt und Art ändern sich nie. Abgeschlossene Berichte sind unveränderlich (nur das Büro darf sie noch archivieren).
-- Beim Abschließen merkt sich die Datenbank den Zeitpunkt; zurück zum Entwurf gibt es nicht.
create function public.bericht_schuetzen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id or new.art is distinct from old.art then
    raise exception 'Projekt und Art eines Berichts ändern sich nie.' using errcode = 'P0001';
  end if;
  if old.status = 'abgeschlossen' then
    if new.status is distinct from old.status or new.datum is distinct from old.datum or new.daten is distinct from old.daten
       or new.unterschrift_name is distinct from old.unterschrift_name or new.unterschrift_pfad is distinct from old.unterschrift_pfad
       or new.unterschrieben_am is distinct from old.unterschrieben_am or new.abgeschlossen_am is distinct from old.abgeschlossen_am then
      raise exception 'Ein abgeschlossener Bericht kann nicht mehr geändert werden.' using errcode = 'P0001';
    end if;
    if new.archiviert_am is distinct from old.archiviert_am and not public.ist_buero_oder_admin() then
      raise exception 'Einen abgeschlossenen Bericht kann nur das Büro archivieren.' using errcode = 'P0001';
    end if;
  elsif new.status = 'abgeschlossen' then
    new.abgeschlossen_am := now();
  end if;
  return new;
end;
$$;
create trigger project_reports_schuetzen before update on public.project_reports
  for each row execute function public.bericht_schuetzen();
revoke execute on function public.bericht_schuetzen() from public, anon, authenticated;

alter table public.project_reports enable row level security;

create policy project_reports_lesen on public.project_reports for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));
create policy project_reports_anlegen on public.project_reports for insert to authenticated
  with check (
    erstellt_von = (select auth.uid())
    and status = 'entwurf'
    and ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id))
    and not exists (select 1 from public.projects p where p.id = project_id and p.archiviert_am is not null)
  );
-- Ändern: das Büro alles, sonst nur der Ersteller (und nur solange er Mitglied ist)
create policy project_reports_aendern on public.project_reports for update to authenticated
  using ((select public.ist_buero_oder_admin()) or (erstellt_von = (select auth.uid()) and public.ist_projektmitglied(project_id)))
  with check ((select public.ist_buero_oder_admin()) or (erstellt_von = (select auth.uid()) and public.ist_projektmitglied(project_id)));


-- -----------------------------------------------------------------------------
-- Speicher für die Unterschrift: privater Bucket, Pfad <project_id>/<bericht_id>.png, PNG bis 512 KB
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('berichtunterschriften', 'berichtunterschriften', false, 524288, array['image/png'])
on conflict (id) do nothing;

create policy berichtunterschriften_lesen on storage.objects for select to authenticated
  using (
    bucket_id = 'berichtunterschriften'
    and ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(public.projekt_aus_pfad(name)))
  );
create policy berichtunterschriften_hochladen on storage.objects for insert to authenticated
  with check (
    bucket_id = 'berichtunterschriften'
    and public.projekt_aus_pfad(name) is not null
    and ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(public.projekt_aus_pfad(name)))
  );
-- Kein Ändern/Löschen über die App: Eine Unterschrift bleibt, wie sie ist.
