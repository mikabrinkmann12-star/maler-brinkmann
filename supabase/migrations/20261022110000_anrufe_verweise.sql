-- Anrufe: Verweise auf Nutzer dürfen ein Löschen des Nutzers nicht blockieren (der Verweis wird dann leer), und der Schutz-Trigger
-- darf einen leeren „bearbeitet_von“ stehen lassen (vorher hat er den alten Wert wieder eingesetzt und so genau das verhindert).

alter table public.calls drop constraint calls_erstellt_von_fkey;
alter table public.calls add constraint calls_erstellt_von_fkey foreign key (erstellt_von) references public.profiles (id) on delete set null;
alter table public.calls drop constraint calls_bearbeitet_von_fkey;
alter table public.calls add constraint calls_bearbeitet_von_fkey foreign key (bearbeitet_von) references public.profiles (id) on delete set null;

create or replace function public.anruf_schuetzen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.anbieter := old.anbieter;
  new.anbieter_id := old.anbieter_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  -- Wer eingeloggt ändert, steht als Bearbeiter; ohne Login (Dienst, Aufräumen) bleibt, was mitgegeben wurde
  new.bearbeitet_von := coalesce((select auth.uid()), new.bearbeitet_von);
  return new;
end;
$$;
