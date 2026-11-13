-- Nachtrag zu 20261113100000 (Sicherheits-Check 13.11.2026): Die Kunden-Antwort darf auch beim ANLEGEN einer Freigabe
-- nicht von einem eingeloggten Nutzer mitgegeben werden (sonst könnte das Büro eine Annahme vortäuschen).
-- Eingeloggt (Büro) → Antwort-Felder werden beim Anlegen geleert; die öffentliche Seite (Dienst-Client) setzt sie nur per UPDATE.

create function public.quote_share_anlegen_schuetzen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.antwort := null;
    new.antwort_am := null;
    new.antwort_name := null;
    new.antwort_grund := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.quote_share_anlegen_schuetzen() from public, anon, authenticated;

create trigger quote_shares_anlegen_schuetzen before insert on public.quote_shares
  for each row execute function public.quote_share_anlegen_schuetzen();
