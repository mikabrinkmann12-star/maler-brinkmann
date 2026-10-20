-- API-Schlüssel (Mika, 20.10.2026): Ein Programm wie „Jarvis“ (Sprachassistent) soll die App über eine Schnittstelle bedienen können.
-- Nur der Admin legt Schlüssel an und widerruft sie. Der Schlüssel selbst wird nur EINMAL angezeigt; gespeichert wird nur sein SHA-256-Hash.
-- Jeder Aufruf wird protokolliert (api_log). Rechte der Schlüssel: „lesen“ und/oder „schreiben“. Die Schnittstelle erlaubt bewusst
-- nichts Unumkehrbares: nichts versenden (E-Mail, Buchhaltung), nichts löschen.

create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 80),
  key_hash      text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  prefix        text not null check (length(prefix) between 4 and 16),  -- Anfang des Schlüssels zum Wiedererkennen
  scopes        text[] not null default array['lesen']::text[] check (scopes <@ array['lesen', 'schreiben']::text[] and cardinality(scopes) >= 1),
  created_by    uuid not null references public.profiles (id) default auth.uid(),  -- in dessen Namen der Schlüssel Einträge anlegt
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create table public.api_log (
  id         bigint generated always as identity primary key,
  key_id     uuid references public.api_keys (id),
  methode    text not null,
  pfad       text not null check (length(pfad) <= 300),
  status     integer not null,
  created_at timestamptz not null default now()
);
create index api_log_key_idx on public.api_log (key_id, created_at desc);

create trigger api_keys_audit after insert or update or delete on public.api_keys
  for each row execute function public.protokolliere_aenderung();

alter table public.api_keys enable row level security;
alter table public.api_log  enable row level security;
revoke truncate on public.api_keys, public.api_log from anon, authenticated;

-- Admin sieht, legt an und widerruft (Hash und Name ändern sich nicht); kein DELETE. Die Schnittstelle selbst prüft mit dem Dienst-Schlüssel.
create policy api_keys_lesen on public.api_keys for select to authenticated using ((select public.ist_admin()));
create policy api_keys_anlegen on public.api_keys for insert to authenticated
  with check ((select public.ist_admin()) and created_by = (select auth.uid()) and revoked_at is null);
create policy api_keys_aendern on public.api_keys for update to authenticated
  using ((select public.ist_admin())) with check ((select public.ist_admin()));
create policy api_log_lesen on public.api_log for select to authenticated using ((select public.ist_admin()));

-- Hash, Name, Rechte und Ersteller sind nach dem Anlegen fest; änderbar ist nur „widerrufen“
create function public.api_key_schuetzen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.key_hash := old.key_hash;
  new.prefix := old.prefix;
  new.name := old.name;
  new.scopes := old.scopes;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if old.revoked_at is not null then new.revoked_at := old.revoked_at; end if;  -- widerrufen bleibt widerrufen
  return new;
end;
$$;
revoke execute on function public.api_key_schuetzen() from public, anon, authenticated;
create trigger api_keys_schuetzen before update on public.api_keys
  for each row execute function public.api_key_schuetzen();
