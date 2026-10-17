-- Projekt-Chat (Mika, 18.10.2026): Nachrichten pro Projekt, Anhänge (Foto oder Datei) liegen zugleich in der Ablage,
-- „ungelesen“-Zähler ohne Push. Lesen und schreiben dürfen Büro/Admin und die Mitglieder des Projekts.
-- Der Chat eines archivierten Projekts bleibt privat (anders als Notizen und Fotos): nur Büro/Admin und frühere Mitglieder.
-- Eigene Nachrichten lassen sich entfernen (archivieren), nichts wird gelöscht.

create table public.project_messages (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id),
  text           text not null default '' check (length(text) <= 2000),
  foto_id        uuid references public.project_photos (id),
  datei_id       uuid references public.project_files (id),
  erstellt_von   uuid references public.profiles (id) default auth.uid(),
  archiviert_am  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint project_messages_nicht_leer check (btrim(text) <> '' or foto_id is not null or datei_id is not null),
  constraint project_messages_ein_anhang check (foto_id is null or datei_id is null)
);
create index project_messages_project_idx on public.project_messages (project_id, created_at);

create trigger project_messages_ersteller before update on public.project_messages
  for each row execute function public.ersteller_festhalten();
create trigger project_messages_updated_at before update on public.project_messages
  for each row execute function public.setze_updated_at();
create trigger project_messages_audit after insert or update or delete on public.project_messages
  for each row execute function public.protokolliere_aenderung();

-- Der Inhalt einer Nachricht ändert sich nach dem Senden nie, nur das Archivieren ist möglich.
create function public.nachricht_unveraenderlich()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.text is distinct from old.text or new.foto_id is distinct from old.foto_id
     or new.datei_id is distinct from old.datei_id or new.project_id is distinct from old.project_id then
    raise exception 'Eine gesendete Nachricht kann nicht geändert werden.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger project_messages_unveraenderlich before update on public.project_messages
  for each row execute function public.nachricht_unveraenderlich();
revoke execute on function public.nachricht_unveraenderlich() from public, anon, authenticated;

alter table public.project_messages enable row level security;

create policy project_messages_lesen on public.project_messages for select to authenticated
  using ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id));
-- Schreiben: als man selbst, in aktiven Projekten, als Mitglied oder Büro; ein Anhang muss zum selben Projekt gehören.
create policy project_messages_anlegen on public.project_messages for insert to authenticated
  with check (
    erstellt_von = (select auth.uid())
    and ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id))
    and not exists (select 1 from public.projects p where p.id = project_id and p.archiviert_am is not null)
    and (foto_id is null or exists (select 1 from public.project_photos f where f.id = foto_id and f.project_id = project_messages.project_id))
    and (datei_id is null or exists (select 1 from public.project_files d where d.id = datei_id and d.project_id = project_messages.project_id))
  );
create policy project_messages_aendern on public.project_messages for update to authenticated
  using ((select public.ist_buero_oder_admin()) or erstellt_von = (select auth.uid()))
  with check ((select public.ist_buero_oder_admin()) or erstellt_von = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- „Gelesen bis“ je Person und Projekt (für den Neu-Zähler)
-- -----------------------------------------------------------------------------
create table public.chat_reads (
  project_id   uuid not null references public.projects (id),
  user_id      uuid not null references public.profiles (id) default auth.uid(),
  gelesen_bis  timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table public.chat_reads enable row level security;
create policy chat_reads_lesen on public.chat_reads for select to authenticated using (user_id = (select auth.uid()));
create policy chat_reads_anlegen on public.chat_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and ((select public.ist_buero_oder_admin()) or public.ist_projektmitglied(project_id)));
create policy chat_reads_aendern on public.chat_reads for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Anzahl ungelesener Nachrichten je Projekt für den eingeloggten Nutzer (mit seinen Rechten: nur Projekte, die er lesen darf).
create function public.chat_ungelesen()
returns table (project_id uuid, anzahl bigint)
language sql
stable
set search_path = ''
as $$
  select m.project_id, count(*)
    from public.project_messages m
    left join public.chat_reads r on r.project_id = m.project_id and r.user_id = (select auth.uid())
   where m.archiviert_am is null
     and m.erstellt_von is distinct from (select auth.uid())
     and (r.gelesen_bis is null or m.created_at > r.gelesen_bis)
   group by m.project_id;
$$;
revoke execute on function public.chat_ungelesen() from public, anon;
grant execute on function public.chat_ungelesen() to authenticated;
