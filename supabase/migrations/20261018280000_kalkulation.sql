-- Kalkulation wie in Plancraft (Mika, 18.10.2026): Eine Leistung setzt sich aus Lohn (Zeit × Lohngruppe), Material, Geräten,
-- Fremdleistung und Sonstigem zusammen. Jede Kostenart hat einen eigenen Zuschlag; der Lohn rechnet mit dem Verrechnungssatz der Lohngruppe.
-- Startwerte aus dem Plancraft-Konto: Lohnkosten 24,88 €/h, Verrechnungssatz 47,50 €/h, Zuschläge Material 40 %, Geräte 5 %,
-- Fremdleistungen 0 %, Sonstiges 3 %.
--
-- Die Preise stehen in einer eigenen Tabelle (nicht in app_settings), denn app_settings dürfen alle Eingeloggten lesen, die Lohnkosten
-- und Verrechnungssätze aber nur Büro und Admin. Geändert werden sie nur vom Admin.

create table public.kalkulation_einstellungen (
  id          uuid primary key default gen_random_uuid(),
  einzig      boolean not null default true unique check (einzig),   -- es gibt genau eine Zeile
  zuschlaege  jsonb not null,    -- { material, geraete, fremdleistung, sonstiges } in Prozent
  lohngruppen jsonb not null,    -- [ { id, name, lohnkosten, verrechnungssatz } ] in € je Stunde
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) default auth.uid()
);

insert into public.kalkulation_einstellungen (zuschlaege, lohngruppen) values (
  jsonb_build_object('material', 40, 'geraete', 5, 'fremdleistung', 0, 'sonstiges', 3),
  jsonb_build_array(jsonb_build_object('id', 'standard', 'name', 'Standard', 'lohnkosten', 24.88, 'verrechnungssatz', 47.50))
);

create trigger kalkulation_einstellungen_updated_at before update on public.kalkulation_einstellungen
  for each row execute function public.setze_updated_at();
create trigger kalkulation_einstellungen_audit after insert or update or delete on public.kalkulation_einstellungen
  for each row execute function public.protokolliere_aenderung();

alter table public.kalkulation_einstellungen enable row level security;

create policy kalkulation_lesen on public.kalkulation_einstellungen
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy kalkulation_aendern on public.kalkulation_einstellungen
  for update to authenticated
  using ((select public.ist_admin())) with check ((select public.ist_admin()));
-- Kein INSERT und kein DELETE: die eine Zeile ist angelegt und bleibt.

-- Die Zusammensetzung einer Leistung (Lohnminuten, Lohngruppe, Beträge je Kostenart), damit sie sich später wieder bearbeiten lässt.
-- Leer = die Leistung hat nur Kosten und Zuschlag (wie bisher, z. B. aus dem Import). Der Verkaufspreis bleibt die berechnete Spalte `vk`.
alter table public.services add column kalkulation jsonb;
