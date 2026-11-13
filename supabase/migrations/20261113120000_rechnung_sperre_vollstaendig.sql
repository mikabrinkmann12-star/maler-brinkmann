-- Sicherheits-Check 13.11.2026: Fertige Rechnungen waren nicht vollständig gesperrt. Ein eingeloggter Büro-Nutzer hätte über die
-- Datenbank-Schnittstelle (am Programm vorbei) Rechnungsnummer, Beträge oder den Pfad des gespeicherten PDFs ändern und das PDF im
-- Speicher überschreiben können. Das widerspricht „lückenlos, nach dem Fertigstellen gesperrt“ (GoBD, bestätigt von der Steuerberaterin).
--
-- Regeln für eingeloggte Nutzer (Rolle `authenticated`). `rechnung_finalisieren` läuft als SECURITY DEFINER unter dem Eigentümer
-- und ist davon nicht betroffen; der Dienst-Client (Tests, Seed, Sicherung) ebenfalls nicht.
--  * Rechnungsnummer und Status ändern sich nur über `rechnung_finalisieren` (neue Rechnungen immer als Entwurf ohne Nummer).
--  * Nach dem Fertigstellen bleiben Beträge, Abzüge, Anbieter und Zeitpunkt der Fertigstellung fest.
--  * Der PDF-Pfad wird genau einmal gesetzt, und zwar auf `<id>.pdf`; danach nie mehr geändert.
--  * Rechnungsdateien im Speicher werden nie überschrieben; neu ablegen nur als `<id>.pdf` einer fertigen Rechnung ohne PDF.
-- Erlaubt bleiben: bezahlt/offen, Mahnstufe, Notiz, Versanddatum, Archivieren von Entwürfen.

create function public.rechnung_abschluss_schuetzen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.rechnungsnummer is not null or new.status <> 'entwurf' then
      raise exception 'Neue Rechnungen beginnen als Entwurf ohne Nummer. Die Nummer vergibt nur „Fertigstellen“.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.rechnungsnummer is distinct from old.rechnungsnummer or new.status is distinct from old.status then
    raise exception 'Rechnungsnummer und Status ändern sich nur über „Fertigstellen“.' using errcode = 'P0001';
  end if;
  if old.status <> 'entwurf' and (
       new.netto is distinct from old.netto
    or new.brutto is distinct from old.brutto
    or new.anbieter is distinct from old.anbieter
    or new.uebertragen_am is distinct from old.uebertragen_am
  ) then
    raise exception 'Diese Rechnung wurde schon fertiggestellt und ist gesperrt.' using errcode = 'P0001';
  end if;
  if new.pdf_pfad is distinct from old.pdf_pfad then
    if old.pdf_pfad is not null or new.pdf_pfad is distinct from (new.id::text || '.pdf') or old.status = 'entwurf' then
      raise exception 'Das gespeicherte PDF einer Rechnung lässt sich nicht austauschen.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.rechnung_abschluss_schuetzen() from public, anon, authenticated;

create trigger invoices_abschluss_schuetzen before insert or update on public.invoices
  for each row execute function public.rechnung_abschluss_schuetzen();

-- Speicher: nie überschreiben, neu nur das PDF einer fertigen Rechnung, die noch keins hat
drop policy rechnungen_ueberschreiben on storage.objects;

create function public.rechnung_pdf_ablegen_erlaubt(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.invoices i
     where i.id::text || '.pdf' = p_name
       and i.status <> 'entwurf'
       and i.pdf_pfad is null
  );
$$;
revoke execute on function public.rechnung_pdf_ablegen_erlaubt(text) from public, anon;
grant execute on function public.rechnung_pdf_ablegen_erlaubt(text) to authenticated;

create policy rechnungen_nur_fertiges_pdf on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'rechnungen' or (select public.rechnung_pdf_ablegen_erlaubt(name)));
