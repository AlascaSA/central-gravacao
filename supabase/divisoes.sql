-- Divisões da gravação: cada vídeo do projeto (Vídeo 01, Vídeo 02…) reúne todos os seus takes,
-- inclusive os com erro. O nome é editável no Catálogo. A IA cria as divisões pela linha do tempo.
alter table brutos add column if not exists gravado_em timestamptz; -- horário REAL de gravação (metadado do arquivo)
alter table brutos add column if not exists camera text;            -- aparelho que gravou (dois celulares = dois ângulos)
alter table brutos add column if not exists divisao_id uuid;

create table if not exists divisoes (
  id uuid primary key default gen_random_uuid(),
  team text not null,
  nome text not null,
  ordem int,
  criado_em timestamptz default now()
);
alter table divisoes enable row level security;
drop policy if exists "divisoes anon all" on divisoes;
create policy "divisoes anon all" on divisoes for all to anon using (true) with check (true);
