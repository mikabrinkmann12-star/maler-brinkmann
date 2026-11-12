-- Kundenkonten ab 10001: 10000 ist der Sammeldebitor (Rechnungen ohne eigenes Kundenkonto).
-- Noch nichts exportiert (12.11.2026), daher alle bestehenden Nummern um eins verschieben.
drop index public.contacts_debitorennummer_eindeutig;
update public.contacts set debitorennummer = debitorennummer + 1 where debitorennummer between 10000 and 69998;
create unique index contacts_debitorennummer_eindeutig on public.contacts (debitorennummer) where debitorennummer is not null;

create or replace function public.debitorennummer_vergeben()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.debitorennummer is null then
    -- gegen gleichzeitiges Anlegen: kurz sperren, dann die nächste freie Nummer (frühestens 10001)
    perform pg_advisory_xact_lock(hashtext('contacts_debitorennummer'));
    select greatest(coalesce(max(debitorennummer), 10000), 10000) + 1 into new.debitorennummer from public.contacts;
    if new.debitorennummer > 69999 then new.debitorennummer := null; end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.debitorennummer_vergeben() from public, anon, authenticated;
