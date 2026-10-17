-- Chat als gelesen markieren mit der Uhr der Datenbank (nicht der Uhr von App oder Handy), damit der Neu-Zähler nicht verrutscht.
-- Läuft mit den Rechten des Nutzers: Die Regeln von chat_reads (nur eigene Zeile, nur Büro/Mitglieder) gelten weiter.

create function public.chat_gelesen_markieren(p_projekt uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.chat_reads (project_id, user_id, gelesen_bis)
  values (p_projekt, (select auth.uid()), clock_timestamp())
  on conflict (project_id, user_id) do update set gelesen_bis = excluded.gelesen_bis;
$$;
revoke execute on function public.chat_gelesen_markieren(uuid) from public, anon;
grant execute on function public.chat_gelesen_markieren(uuid) to authenticated;
