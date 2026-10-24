-- Eigene Rechnungen, zweite Stufe (Mika, 24.10.2026): Rechnungsarten (Abschlag, Schluss, Gutschrift, Storno), eigener Nummernkreis für Gutschriften
-- und Stornos, Abzug bereits gestellter Abschlagsrechnungen in der Schlussrechnung.
--
--  art = rechnung  normale Rechnung
--        abschlag  Abschlagsrechnung (zu einem Angebot, normaler Nummernkreis)
--        schluss   Schlussrechnung (zieht die Abschlagsrechnungen desselben Angebots ab, § 14 Abs. 5 UStG)
--        gutschrift Teilgutschrift zu einer Rechnung (eigener Nummernkreis „G-“)
--        storno    Stornorechnung: macht eine ganze Rechnung rückgängig (Nummernkreis „G-“); die Original-Rechnung gilt danach als storniert
-- Gutschriften und Stornos tragen POSITIVE Mengen und Preise wie die Rechnung; ihre Summen (netto/brutto) stehen NEGATIV in der Datenbank.

alter table public.invoices add column art text not null default 'rechnung'
  check (art in ('rechnung', 'abschlag', 'schluss', 'gutschrift', 'storno'));
alter table public.invoices add column bezug_id uuid references public.invoices (id);
alter table public.invoices add column abzug_netto numeric(12, 2) not null default 0;
alter table public.invoices add column abzug_brutto numeric(12, 2) not null default 0;
alter table public.invoices add constraint invoices_bezug_nur_gutschrift
  check ((art in ('gutschrift', 'storno')) = (bezug_id is not null));
create index invoices_bezug_idx on public.invoices (bezug_id);

-- Die Art ändert sich nie (auch im Entwurf nicht), ebenso der Bezug
create or replace function public.rechnung_sperre_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id or new.contact_id is distinct from old.contact_id
     or new.quote_id is distinct from old.quote_id then
    raise exception 'Projekt, Kunde und Angebot einer Rechnung lassen sich nicht ändern.' using errcode = 'P0001';
  end if;
  if new.art is distinct from old.art or new.bezug_id is distinct from old.bezug_id then
    raise exception 'Die Art einer Rechnung lässt sich nicht ändern.' using errcode = 'P0001';
  end if;
  if old.status <> 'entwurf' and (
       new.betreff is distinct from old.betreff
    or new.rechnungsdatum is distinct from old.rechnungsdatum
    or new.leistung_von is distinct from old.leistung_von
    or new.leistung_bis is distinct from old.leistung_bis
    or new.zahlungsziel_tage is distinct from old.zahlungsziel_tage
    or new.skonto_prozent is distinct from old.skonto_prozent
    or new.skonto_tage is distinct from old.skonto_tage
    or new.steuersatz is distinct from old.steuersatz
    or new.reverse_charge is distinct from old.reverse_charge
    or new.rabatt_prozent is distinct from old.rabatt_prozent
    or new.einleitung is distinct from old.einleitung
    or new.schlusstext is distinct from old.schlusstext
    or new.abzug_netto is distinct from old.abzug_netto
    or new.abzug_brutto is distinct from old.abzug_brutto
  ) then
    raise exception 'Diese Rechnung wurde schon fertiggestellt und ist gesperrt.' using errcode = 'P0001';
  end if;
  -- Eine fertige Rechnung wird nie wieder zum Entwurf.
  if old.status = 'uebertragen' and new.status <> 'uebertragen' then
    raise exception 'Eine fertige Rechnung kann nicht zurück auf Entwurf gesetzt werden.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Zähler je Gruppe: „rechnung“ (Rechnung, Abschlag, Schluss) und „gutschrift“ (Gutschrift, Storno)
alter table public.invoice_counters add column gruppe text not null default 'rechnung' check (gruppe in ('rechnung', 'gutschrift'));
alter table public.invoice_counters drop constraint invoice_counters_pkey;
alter table public.invoice_counters add primary key (gruppe, jahr);

-- Abzug der Abschlagsrechnungen in einer Schlussrechnung (Momentaufnahme beim Fertigstellen)
create table public.invoice_abschlaege (
  invoice_id uuid not null references public.invoices (id),
  abschlag_id uuid not null references public.invoices (id),
  netto      numeric(12, 2) not null,
  brutto     numeric(12, 2) not null,
  primary key (invoice_id, abschlag_id)
);
alter table public.invoice_abschlaege enable row level security;
revoke truncate on public.invoice_abschlaege from anon, authenticated;
revoke insert, update, delete on public.invoice_abschlaege from anon, authenticated;
create policy invoice_abschlaege_lesen on public.invoice_abschlaege for select to authenticated
  using ((select public.ist_buero_oder_admin()));
create trigger invoice_abschlaege_audit after insert or update or delete on public.invoice_abschlaege
  for each row execute function public.protokolliere_aenderung();

-- Fertigstellen (ersetzt die Funktion der ersten Stufe; mit 3 Argumenten weiter aufrufbar)
drop function public.rechnung_finalisieren(uuid, numeric, numeric);
create function public.rechnung_finalisieren(p_id uuid, p_netto numeric, p_brutto numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r        public.invoices%rowtype;
  v_o        public.invoices%rowtype;
  v_gruppe   text;
  v_jahr     integer;
  v_praefix  text;
  v_start    integer;
  v_n        integer;
  v_letztes  date;
  v_nummer   text;
  v_abz_n    numeric(12, 2) := 0;
  v_abz_b    numeric(12, 2) := 0;
  v_status   text := 'open';
  v_bezahlt  date;
  v_heute    date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not ((select public.ist_buero_oder_admin()) and (select public.recht_ok('rechnungen'))) then
    raise exception 'Dafür fehlt dir die Berechtigung.' using errcode = 'P0001';
  end if;
  if p_netto is null or p_brutto is null then
    raise exception 'Netto und Brutto fehlen.' using errcode = 'P0001';
  end if;

  select * into v_r from public.invoices where id = p_id for update;
  if not found then
    raise exception 'Rechnung nicht gefunden.' using errcode = 'P0001';
  end if;
  if v_r.status <> 'entwurf' or v_r.archiviert_am is not null then
    raise exception 'Diese Rechnung ist schon fertig, wird gerade übertragen oder ist archiviert.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.invoice_items where invoice_id = p_id and typ = 'position') then
    raise exception 'Die Rechnung hat keine Position.' using errcode = 'P0001';
  end if;
  if v_r.rechnungsdatum > v_heute then
    raise exception 'Das Rechnungsdatum liegt in der Zukunft. Bitte auf heute oder früher setzen.' using errcode = 'P0001';
  end if;

  v_gruppe := case when v_r.art in ('gutschrift', 'storno') then 'gutschrift' else 'rechnung' end;

  if v_gruppe = 'gutschrift' then
    if p_netto > 0 or p_brutto > 0 then
      raise exception 'Die Summen einer Gutschrift bzw. Stornorechnung sind negativ.' using errcode = 'P0001';
    end if;
    select * into v_o from public.invoices where id = v_r.bezug_id for update;
    if not found or v_o.anbieter <> 'eigen' or v_o.status <> 'uebertragen' or v_o.art in ('gutschrift', 'storno') then
      raise exception 'Gutschrift und Storno gibt es nur zu einer fertigen Rechnung der App.' using errcode = 'P0001';
    end if;
    if v_o.lexware_status = 'voided' then
      raise exception 'Die Rechnung % ist schon storniert.', v_o.rechnungsnummer using errcode = 'P0001';
    end if;
    if v_r.art = 'storno' then
      if exists (select 1 from public.invoices where bezug_id = v_o.id and art = 'storno' and status = 'uebertragen') then
        raise exception 'Zu dieser Rechnung gibt es schon eine Stornorechnung.' using errcode = 'P0001';
      end if;
      v_status := 'paid';
      v_bezahlt := v_heute;
    end if;
  elsif p_netto < 0 or p_brutto < 0 then
    raise exception 'Die Summen einer Rechnung dürfen nicht negativ sein.' using errcode = 'P0001';
  end if;

  -- Schlussrechnung: Abschlagsrechnungen desselben Angebots abziehen (Momentaufnahme)
  if v_r.art = 'schluss' then
    if v_r.quote_id is null then
      raise exception 'Eine Schlussrechnung braucht ein Angebot.' using errcode = 'P0001';
    end if;
    insert into public.invoice_abschlaege (invoice_id, abschlag_id, netto, brutto)
      select p_id, a.id, a.netto, a.brutto from public.invoices a
       where a.quote_id = v_r.quote_id and a.art = 'abschlag' and a.status = 'uebertragen' and a.anbieter = 'eigen' and a.lexware_status <> 'voided';
    select coalesce(sum(netto), 0), coalesce(sum(brutto), 0) into v_abz_n, v_abz_b from public.invoice_abschlaege where invoice_id = p_id;
    if p_brutto - v_abz_b < 0 then
      raise exception 'Die Abschlagsrechnungen (% €) übersteigen die Rechnungssumme.', to_char(v_abz_b, 'FM999G999G990D00') using errcode = 'P0001';
    end if;
  end if;

  v_jahr := extract(year from v_r.rechnungsdatum)::integer;

  -- Zeitliche Reihenfolge je Nummernkreis: Eine neue Nummer soll nicht ein älteres Datum tragen als die vorige desselben Jahres
  select max(rechnungsdatum) into v_letztes from public.invoices
    where anbieter = 'eigen' and status = 'uebertragen' and extract(year from rechnungsdatum)::integer = v_jahr
      and (case when art in ('gutschrift', 'storno') then 'gutschrift' else 'rechnung' end) = v_gruppe;
  if v_letztes is not null and v_r.rechnungsdatum < v_letztes then
    raise exception 'Die letzte Nummer dieses Nummernkreises hat das Datum %. Bitte das Rechnungsdatum nicht davor legen.', to_char(v_letztes, 'DD.MM.YYYY') using errcode = 'P0001';
  end if;

  if v_gruppe = 'rechnung' then
    select coalesce(nullif(btrim(wert ->> 'rechnung_praefix'), ''), 'R-'), greatest(coalesce((wert ->> 'rechnung_start')::integer, 1), 1)
      into v_praefix, v_start from public.app_settings where schluessel = 'nummernkreise';
    v_praefix := coalesce(v_praefix, 'R-');
  else
    select coalesce(nullif(btrim(wert ->> 'gutschrift_praefix'), ''), 'G-'), greatest(coalesce((wert ->> 'gutschrift_start')::integer, 1), 1)
      into v_praefix, v_start from public.app_settings where schluessel = 'nummernkreise';
    v_praefix := coalesce(v_praefix, 'G-');
  end if;
  v_start := coalesce(v_start, 1);

  insert into public.invoice_counters (gruppe, jahr, letzte) values (v_gruppe, v_jahr, v_start - 1) on conflict (gruppe, jahr) do nothing;
  update public.invoice_counters set letzte = letzte + 1, updated_at = now() where gruppe = v_gruppe and jahr = v_jahr returning letzte into v_n;

  v_nummer := v_praefix || v_jahr::text || '-' || lpad(v_n::text, 4, '0');

  update public.invoices
     set status = 'uebertragen', anbieter = 'eigen', rechnungsnummer = v_nummer, lexware_status = v_status, bezahlt_am = v_bezahlt,
         netto = p_netto - v_abz_n, brutto = p_brutto - v_abz_b, abzug_netto = v_abz_n, abzug_brutto = v_abz_b,
         uebertragen_am = now(), abgeglichen_am = now()
   where id = p_id;

  if v_r.art = 'storno' then
    update public.invoices set lexware_status = 'voided', storniert_am = now(), mahnstufe = 0, angemahnt_am = null where id = v_o.id;
  end if;
  return v_nummer;
end;
$$;
revoke execute on function public.rechnung_finalisieren(uuid, numeric, numeric) from public, anon;
grant execute on function public.rechnung_finalisieren(uuid, numeric, numeric) to authenticated;
