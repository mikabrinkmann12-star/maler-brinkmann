-- Glas-Look (Mika, 11.11.2026): Schalter unter „Darstellung“ für Liquid Glass und weiche Übergänge. null = Vorgabe der Firma, Standard aus.
alter table public.nutzer_darstellung add column glas boolean;
comment on column public.nutzer_darstellung.glas is 'Glas-Look mit weichen Übergängen an/aus; null = Vorgabe der Firma (Standard aus)';
