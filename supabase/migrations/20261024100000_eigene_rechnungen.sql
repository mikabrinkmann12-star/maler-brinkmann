-- Eigene Rechnungen (Mika, 24.10.2026: „Paul will nicht extra für Lexware zahlen“): Die App kann Rechnungsnummer und PDF jetzt selbst erzeugen.
-- Lexware/sevdesk bleiben als abschaltbarer Anschluss (invoices.anbieter). WICHTIG: Der Steuerberater von Ralf muss das Verfahren vor dem
-- echten Einsatz bestätigen (GoBD: lückenlose Nummer, nach dem Fertigstellen unveränderbar, Aufbewahrung, ab 2028 E-Rechnung).
--
-- Die Nummer wird in EINER Datenbank-Transaktion zusammen mit dem Status „fertig“ vergeben (Funktion `rechnung_finalisieren`):
-- bricht etwas ab, wird auch die Nummer zurückgenommen, es entstehen keine Lücken. Der Zähler läuft je Kalenderjahr.

alter table public.invoices drop constraint invoices_anbieter_check;
alter table public.invoices add constraint invoices_anbieter_check check (anbieter in ('lexware', 'sevdesk', 'eigen'));

-- Eine eigene Rechnungsnummer gibt es nur einmal
create unique index invoices_eigene_nummer_idx on public.invoices (rechnungsnummer) where anbieter = 'eigen';

-- Zähler je Jahr (letzte vergebene laufende Nummer). Nur die Funktion unten schreibt hinein.
create table public.invoice_counters (
  jahr       integer primary key check (jahr between 2000 and 2100),
  letzte     integer not null check (letzte >= 0),
  updated_at timestamptz not null default now()
);
alter table public.invoice_counters enable row level security;
revoke truncate on public.invoice_counters from anon, authenticated;
revoke insert, update, delete on public.invoice_counters from anon, authenticated;
create policy invoice_counters_lesen on public.invoice_counters for select to authenticated
  using ((select public.ist_buero_oder_admin()));
create trigger invoice_counters_audit after insert or update or delete on public.invoice_counters
  for each row execute function public.protokolliere_aenderung();

-- Rechnung fertigstellen: vergibt die nächste Nummer („<Kürzel><Jahr>-<laufende Nummer>“, z. B. R-2026-0001) und setzt den Status.
-- Kürzel und Startnummer stehen in app_settings „nummernkreise“ (rechnung_praefix, rechnung_start; Standard „R-“ und 1; die Startnummer gilt
-- nur für das erste Mal in einem Jahr). Netto und Brutto rechnet die App (gleiche Regeln wie auf dem PDF) und übergibt sie hier.
create function public.rechnung_finalisieren(p_id uuid, p_netto numeric, p_brutto numeric)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r        public.invoices%rowtype;
  v_jahr     integer;
  v_praefix  text;
  v_start    integer;
  v_n        integer;
  v_letztes  date;
  v_nummer   text;
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
  if v_r.rechnungsdatum > (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Das Rechnungsdatum liegt in der Zukunft. Bitte auf heute oder früher setzen.' using errcode = 'P0001';
  end if;

  v_jahr := extract(year from v_r.rechnungsdatum)::integer;

  -- Zeitliche Reihenfolge: Eine neue Nummer soll nicht ein älteres Datum tragen als die vorige Rechnung desselben Jahres
  select max(rechnungsdatum) into v_letztes from public.invoices
    where anbieter = 'eigen' and status = 'uebertragen' and extract(year from rechnungsdatum)::integer = v_jahr;
  if v_letztes is not null and v_r.rechnungsdatum < v_letztes then
    raise exception 'Die letzte Rechnung hat das Datum %. Bitte das Rechnungsdatum nicht davor legen.', to_char(v_letztes, 'DD.MM.YYYY') using errcode = 'P0001';
  end if;

  select coalesce(nullif(btrim(wert ->> 'rechnung_praefix'), ''), 'R-'),
         greatest(coalesce((wert ->> 'rechnung_start')::integer, 1), 1)
    into v_praefix, v_start
    from public.app_settings where schluessel = 'nummernkreise';
  v_praefix := coalesce(v_praefix, 'R-');
  v_start := coalesce(v_start, 1);

  insert into public.invoice_counters (jahr, letzte) values (v_jahr, v_start - 1) on conflict (jahr) do nothing;
  update public.invoice_counters set letzte = letzte + 1, updated_at = now() where jahr = v_jahr returning letzte into v_n;

  v_nummer := v_praefix || v_jahr::text || '-' || lpad(v_n::text, 4, '0');

  update public.invoices
     set status = 'uebertragen', anbieter = 'eigen', rechnungsnummer = v_nummer, lexware_status = 'open',
         netto = p_netto, brutto = p_brutto, uebertragen_am = now(), abgeglichen_am = now()
   where id = p_id;
  return v_nummer;
end;
$$;
revoke execute on function public.rechnung_finalisieren(uuid, numeric, numeric) from public, anon;
grant execute on function public.rechnung_finalisieren(uuid, numeric, numeric) to authenticated;
