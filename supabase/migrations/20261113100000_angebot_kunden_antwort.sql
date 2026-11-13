-- Angebot online annehmen oder ablehnen (Mika, 13.11.2026): Der Kunde antwortet in der Online-Ansicht (/angebot/<Schlüssel>).
-- Die Antwort hängt an der Freigabe (Link), über die sie kam. Gesetzt wird sie nur von der öffentlichen Seite (Dienst-Client),
-- und nur einmal; das Büro kann sie lesen, aber nicht ändern. Der Status des Angebots wird von der Seite mitgesetzt.

alter table public.quote_shares
  add column antwort       text check (antwort in ('angenommen', 'abgelehnt')),
  add column antwort_am    timestamptz,
  add column antwort_name  text check (length(antwort_name) <= 120),
  add column antwort_grund text check (length(antwort_grund) <= 1000),
  add constraint quote_shares_antwort_vollstaendig check ((antwort is null) = (antwort_am is null));

comment on column public.quote_shares.antwort is 'Antwort des Kunden in der Online-Ansicht: angenommen oder abgelehnt (nur einmal, nur über die öffentliche Seite)';

-- Schutz wie bisher, dazu die Antwort-Felder: Mit Login (Büro) bleiben sie unverändert
create or replace function public.quote_share_schuetzen()
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
    new.antwort := old.antwort;
    new.antwort_am := old.antwort_am;
    new.antwort_name := old.antwort_name;
    new.antwort_grund := old.antwort_grund;
  elsif old.antwort is not null then
    -- Eine Antwort steht fest, auch für die öffentliche Seite
    new.antwort := old.antwort;
    new.antwort_am := old.antwort_am;
    new.antwort_name := old.antwort_name;
    new.antwort_grund := old.antwort_grund;
  end if;
  return new;
end;
$$;
revoke execute on function public.quote_share_schuetzen() from public, anon, authenticated;
