-- Eingangsrechnungen (Papa, 15.11.2026):
-- 1. Gutschriften von Lieferanten: Häkchen „Gutschrift“. Beträge bleiben positiv gespeichert, gezählt wird eine Gutschrift als Minus.
-- 2. Postfach alle 15 Minuten abrufen, auch schon gelesene Mails: die App merkt sich die letzte gelesene Mail (UID) und zeigt
--    Zeitpunkt und Ergebnis des letzten Abrufs an (daran sieht man auch ein falsches Passwort).
-- 3. Zeitplan über Supabase (pg_cron + pg_net), weil Vercel Hobby nur einmal am Tag erlaubt. Das Geheimnis liegt im Vault,
--    gesetzt wird es per Skript (scripts/postfach-zeitplan.ts) über `postfach_zeitplan_setzen` (nur Dienst-Schlüssel).

alter table public.incoming_invoices
  add column gutschrift boolean not null default false;
comment on column public.incoming_invoices.gutschrift is 'Gutschrift des Lieferanten: Beträge positiv gespeichert, zählen als Minus';

-- Stand des Postfach-Abrufs (genau eine Zeile)
create table public.postfach_status (
  id             smallint primary key default 1 check (id = 1),
  uid_validity   text,
  letzte_uid     bigint,
  letzter_abruf  timestamptz,
  ergebnis       jsonb,
  updated_at     timestamptz not null default now()
);
alter table public.postfach_status enable row level security;
revoke truncate on public.postfach_status from anon, authenticated;
create policy postfach_status_lesen on public.postfach_status for select to authenticated
  using ((select public.ist_buero_oder_admin()) and (select public.recht_ok('eingangsrechnungen')));
create policy postfach_status_anlegen on public.postfach_status for insert to authenticated
  with check ((select public.ist_buero_oder_admin()) and (select public.recht_ok('eingangsrechnungen')));
create policy postfach_status_aendern on public.postfach_status for update to authenticated
  using ((select public.ist_buero_oder_admin()) and (select public.recht_ok('eingangsrechnungen')))
  with check ((select public.ist_buero_oder_admin()) and (select public.recht_ok('eingangsrechnungen')));
-- Kein DELETE.

-- Zeitplan: pg_cron ruft alle 15 Minuten die Abruf-Adresse der App auf
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function public.postfach_zeitplan_setzen(p_url text, p_geheimnis text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_url !~ '^https://[a-z0-9.-]+/api/cron/eingangsrechnungen$' then
    raise exception 'Ungültige Adresse.';
  end if;
  if length(coalesce(p_geheimnis, '')) < 32 then
    raise exception 'Das Geheimnis ist zu kurz.';
  end if;
  select id into v_id from vault.secrets where name = 'postfach_cron_geheimnis';
  if v_id is null then
    perform vault.create_secret(p_geheimnis, 'postfach_cron_geheimnis', 'Bearer-Geheimnis für /api/cron/eingangsrechnungen');
  else
    perform vault.update_secret(v_id, p_geheimnis);
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'postfach-abruf';
  perform cron.schedule(
    'postfach-abruf',
    '*/15 * * * *',
    format(
      $cmd$select net.http_get(url := %L, headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'postfach_cron_geheimnis')), timeout_milliseconds := 60000)$cmd$,
      p_url
    )
  );
  return 'ok';
end;
$$;
revoke execute on function public.postfach_zeitplan_setzen(text, text) from public, anon, authenticated;
grant execute on function public.postfach_zeitplan_setzen(text, text) to service_role;
