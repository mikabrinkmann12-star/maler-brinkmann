-- Angebote: Zahlungsbedingungen (Zahlungsziel, Skonto) und „gültig bis“ (Mika, 18.10.2026).
-- Beides wird beim Anlegen vorbelegt (Kunde bzw. Einstellungen) und ist im Entwurf änderbar; nach dem Versand gesperrt wie der übrige Inhalt.

alter table public.quotes
  add column zahlungsziel_tage integer check (zahlungsziel_tage between 0 and 365),
  add column skonto_prozent    numeric(4, 2) check (skonto_prozent between 0 and 20),
  add column skonto_tage       integer check (skonto_tage between 1 and 365),
  add column gueltig_bis       date,
  add constraint quotes_skonto_zusammen check ((skonto_prozent is null) = (skonto_tage is null));

-- Sperre nach dem Versand: die neuen Felder gehören zum gesperrten Inhalt.
create or replace function public.angebot_sperre_pruefen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'Ein Angebot kann nicht in ein anderes Projekt verschoben werden.' using errcode = 'P0001';
  end if;
  -- Status bleibt gleich und ist nicht „Entwurf“: Inhalt darf sich nicht ändern (Archivieren und Versanddaten schon).
  if old.status <> 'entwurf' and new.status = old.status and (
       new.betreff is distinct from old.betreff
    or new.leistungsort is distinct from old.leistungsort
    or new.datum is distinct from old.datum
    or new.empfaenger is distinct from old.empfaenger
    or new.einleitung is distinct from old.einleitung
    or new.schlusstext is distinct from old.schlusstext
    or new.steuersatz is distinct from old.steuersatz
    or new.reverse_charge is distinct from old.reverse_charge
    or new.rabatt_prozent is distinct from old.rabatt_prozent
    or new.zahlungsziel_tage is distinct from old.zahlungsziel_tage
    or new.skonto_prozent is distinct from old.skonto_prozent
    or new.skonto_tage is distinct from old.skonto_tage
    or new.gueltig_bis is distinct from old.gueltig_bis
  ) then
    raise exception 'Dieses Angebot wurde schon versendet und ist gesperrt. Setze es zuerst zurück auf Entwurf.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
