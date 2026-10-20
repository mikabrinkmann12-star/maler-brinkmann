-- Angebot per Link (Mika, 20.10.2026, wie Plancraft): Die E-Mail enthält einen Link auf eine Online-Ansicht (PDF ansehen/herunterladen);
-- die App sieht, ob und wann der Kunde das Angebot geöffnet hat. Der Link enthält einen zufälligen Schlüssel (192 Bit), gespeichert wird nur sein SHA-256-Hash.
-- Die öffentliche Seite prüft den Schlüssel selbst (Dienst-Client); alle Nutzer mit Büro-Rechten sehen und widerrufen die Freigaben.

create table public.quote_shares (
  id               uuid primary key default gen_random_uuid(),
  quote_id         uuid not null references public.quotes (id),
  token_hash       text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  an               text check (length(an) <= 320),
  created_by       uuid references public.profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '90 days'),
  first_opened_at  timestamptz,
  last_opened_at   timestamptz,
  open_count       integer not null default 0 check (open_count >= 0),
  pdf_loaded_at    timestamptz,
  revoked_at       timestamptz
);
create index quote_shares_quote_idx on public.quote_shares (quote_id, created_at desc);

create trigger quote_shares_audit after insert or update or delete on public.quote_shares
  for each row execute function public.protokolliere_aenderung();

alter table public.quote_shares enable row level security;
revoke truncate on public.quote_shares from anon, authenticated;

create policy quote_shares_lesen on public.quote_shares for select to authenticated
  using ((select public.ist_buero_oder_admin()));
create policy quote_shares_anlegen on public.quote_shares for insert to authenticated
  with check ((select public.ist_buero_oder_admin()) and created_by = (select auth.uid()) and open_count = 0 and first_opened_at is null);
create policy quote_shares_aendern on public.quote_shares for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));
-- Kein DELETE: Freigaben werden widerrufen.

-- Hash, Angebot, Empfänger und Zähler ändern sich nur über die öffentliche Seite (Dienst-Client); Büro darf widerrufen und die Laufzeit ändern
create function public.quote_share_schuetzen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.token_hash := old.token_hash;
    new.quote_id := old.quote_id;
    new.an := old.an;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.first_opened_at := old.first_opened_at;
    new.last_opened_at := old.last_opened_at;
    new.open_count := old.open_count;
    new.pdf_loaded_at := old.pdf_loaded_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.quote_share_schuetzen() from public, anon, authenticated;
create trigger quote_shares_schuetzen before update on public.quote_shares
  for each row execute function public.quote_share_schuetzen();
