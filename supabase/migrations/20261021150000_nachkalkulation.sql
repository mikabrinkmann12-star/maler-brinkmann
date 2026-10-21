-- Nachkalkulation im Projekt (Mika, 21.10.2026, wie in Plancraft): Soll (aus dem Angebot und der Kalkulation der Leistungen) gegen Ist
-- (Arbeitszeiten, erfasste Kosten, zugewiesene Eingangsrechnungen) je Kostenart.
--
-- Neu: (1) Tabelle project_costs = „Kosten erfassen“ (Material, Geräte, Fremdleistung, Sonstiges, netto), nur Büro/Admin, nichts wird gelöscht.
--      (2) incoming_invoices.kostenart: zu welcher Kostenart eine einem Projekt zugewiesene Eingangsrechnung zählt (Standard Material).
-- Der Lohn kommt aus den Arbeitszeiten (Stunden × Lohnkosten der Lohngruppe), dafür braucht es nichts Neues.

create table public.project_costs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id),
  datum         date not null default current_date,
  kostenart     text not null check (kostenart in ('material', 'geraete', 'fremdleistung', 'sonstiges')),
  betrag        numeric(12,2) not null check (betrag >= 0 and betrag <= 9999999.99),   -- netto
  beschreibung  text not null default '' check (length(beschreibung) <= 300),
  erstellt_von  uuid references public.profiles (id) default auth.uid(),
  archiviert_am timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index project_costs_project_idx on public.project_costs (project_id);

create trigger project_costs_ersteller before update on public.project_costs
  for each row execute function public.ersteller_festhalten();
create trigger project_costs_updated_at before update on public.project_costs
  for each row execute function public.setze_updated_at();
create trigger project_costs_audit after insert or update or delete on public.project_costs
  for each row execute function public.protokolliere_aenderung();

alter table public.project_costs enable row level security;

create policy project_costs_lesen on public.project_costs
  for select to authenticated using ((select public.ist_buero_oder_admin()));
create policy project_costs_anlegen on public.project_costs
  for insert to authenticated with check ((select public.ist_buero_oder_admin()));
create policy project_costs_aendern on public.project_costs
  for update to authenticated
  using ((select public.ist_buero_oder_admin())) with check ((select public.ist_buero_oder_admin()));
-- Kein DELETE (archivieren).

-- Rechte pro Rolle: Ansehen wie „Projekte ansehen“, Erfassen wie „Projekte bearbeiten“ (nur Wegnehmen, Büro-Voreinstellung bleibt wie bisher)
create policy recht_project_costs_select on public.project_costs as restrictive for select to authenticated
  using ((select public.recht_ok('projekte_ansehen')));
create policy recht_project_costs_insert on public.project_costs as restrictive for insert to authenticated
  with check ((select public.hat_recht('projekte_bearbeiten')));
create policy recht_project_costs_update on public.project_costs as restrictive for update to authenticated
  using ((select public.hat_recht('projekte_bearbeiten'))) with check ((select public.hat_recht('projekte_bearbeiten')));

alter table public.incoming_invoices
  add column kostenart text not null default 'material' check (kostenart in ('material', 'geraete', 'fremdleistung', 'sonstiges'));
