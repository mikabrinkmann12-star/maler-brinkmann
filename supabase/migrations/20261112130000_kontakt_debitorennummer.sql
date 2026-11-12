-- Konto je Kunde für DATEV (Steuerberaterin, 12.11.2026: „Am schönsten wäre es, wenn alle Kunden ein eigenes Konto haben“).
-- SKR03: Debitoren 10000–69999. Bestehende Kunden bekommen laufende Nummern ab 10000 (sortiert nach Kundennummer, dann Anlage),
-- neue Kunden automatisch die nächste freie. Im Kontakt sichtbar und änderbar (eindeutig).
alter table public.contacts add column debitorennummer integer check (debitorennummer is null or debitorennummer between 10000 and 69999);
create unique index contacts_debitorennummer_eindeutig on public.contacts (debitorennummer) where debitorennummer is not null;
comment on column public.contacts.debitorennummer is 'Personenkonto (Debitor) für den DATEV-Export, SKR03 10000–69999; neue Kunden bekommen automatisch die nächste freie Nummer';

with reihenfolge as (
  select id, 9999 + row_number() over (order by kundennummer nulls last, created_at, id) as nr
  from public.contacts
)
update public.contacts c set debitorennummer = r.nr from reihenfolge r where c.id = r.id and r.nr <= 69999;

create function public.debitorennummer_vergeben()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.debitorennummer is null then
    -- gegen gleichzeitiges Anlegen: kurz sperren, dann die nächste freie Nummer
    perform pg_advisory_xact_lock(hashtext('contacts_debitorennummer'));
    select coalesce(max(debitorennummer), 9999) + 1 into new.debitorennummer from public.contacts;
    if new.debitorennummer > 69999 then new.debitorennummer := null; end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.debitorennummer_vergeben() from public, anon, authenticated;

create trigger contacts_debitorennummer before insert on public.contacts
  for each row execute function public.debitorennummer_vergeben();
